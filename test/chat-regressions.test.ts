import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addMessage, loadStore, type MessageStore, type StoredMessage } from '../src/store.js';

// Synthetic HOME before importing client: its exported singleton must never load real data.
process.env.HOME = mkdtempSync(join(tmpdir(), 'wacli-chat-tests-'));
const { WacliClient } = await import('../src/client.js');
const dm = 'fixture-user@s.whatsapp.net';
const group = 'fixture-group@g.us';
const message = (chatId = dm, id = 'fixture-1', timestamp = 1000): StoredMessage => ({ id, chatId, sender: chatId, timestamp, body: 'synthetic fixture', isFromMe: false, hasMedia: false });
const emptyStore = (): MessageStore => ({messages: new Map(), chats: new Map(), contacts: new Map()});
test('incoming DM creates one registry entry; duplicate and older messages preserve name/time', () => {
  const store = emptyStore();
  addMessage(store, message());
  assert.equal(store.chats.get(dm)?.isGroup, false);
  store.chats.get(dm)!.name = 'Synthetic Alice';
  addMessage(store, message());
  addMessage(store, message(dm, 'older', 500));
  assert.equal(store.messages.get(dm)?.length, 2);
  assert.deepEqual(store.chats.get(dm), {name:'Synthetic Alice', isGroup:false, lastMessageTime:1000});
  addMessage(store, message(dm, 'newer', 2000));
  assert.equal(store.chats.get(dm)?.lastMessageTime,2000);

});

test('legacy cached DM messages become visible through getChats without history or network', async () => {
  const dir = join(process.env.HOME!, '.config', 'wacli', 'data');
  mkdirSync(dir, {recursive:true});
  writeFileSync(join(dir, 'messages.json'), JSON.stringify({messages:{[dm]:[message()]}, chats:{}, contacts:{}}));
  const before = JSON.stringify(JSON.parse(readFileSync(join(dir, 'messages.json'), 'utf8')));
  assert.equal(loadStore().chats.get(dm)?.isGroup,false);
  assert.equal(JSON.stringify(JSON.parse(readFileSync(join(dir, 'messages.json'), 'utf8'))), before);
  const client = new WacliClient();
  // TS-private fields are assigned only in this synthetic mock; connect/auth never run.
  (client as any).sock = {groupFetchAllParticipating:async()=>({[group]:{subject:'Synthetic Group'}})};
  const chats = await client.getChats();
  assert.equal(chats.filter(c=>!c.isGroup).length,1);
  assert.equal(chats.find(c=>c.id===dm)?.messageCount,1);
  assert.equal(chats.filter(c=>c.isGroup).length,1);
});


test('legacy repair preserves existing names/groups and does not invent chats for empty/other buckets', () => {
  const dir = join(process.env.HOME!, '.config', 'wacli', 'data');
  const lid = 'synthetic@lid';
  writeFileSync(join(dir,'messages.json'), JSON.stringify({
    messages:{[dm]:[message()],[lid]:[message(lid)],'empty@lid':[],'status@broadcast':[message('status@broadcast')]},
    chats:{[dm]:{name:'Known DM',isGroup:false,lastMessageTime:2000},[group]:{name:'Known Group',isGroup:true,lastMessageTime:3000}},
    contacts:{synthetic:'Synthetic Contact'}
  }));
  const store=loadStore();
  assert.equal(store.chats.get(dm)?.name,'Known DM');
  assert.equal(store.chats.get(dm)?.lastMessageTime,2000);
  assert.equal(store.chats.get(group)?.name,'Known Group');
  assert.equal(store.chats.get(lid)?.name,'Synthetic Contact');
  assert.equal(store.chats.has('empty@lid'),false);
  assert.equal(store.chats.has('status@broadcast'),false);
  store.chats.delete(lid);
  addMessage(store,message(lid)); // duplicate delivery must still repair a missing registry entry
  assert.equal(store.chats.get(lid)?.isGroup,false);
  assert.equal(store.messages.get(lid)?.length,1);
});
