import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMessages, AmbiguousChatError, type MessageStore, type StoredMessage } from '../src/store.js';
const group = 'synthetic-group@g.us';
const other = 'synthetic-other@g.us';
const row = (chatId: string, timestamp = 1000): StoredMessage => ({id:`fixture-${chatId}-${timestamp}`,chatId,sender:'synthetic',timestamp,body:'synthetic fixture',isFromMe:false,hasMedia:false});
function fixture(): MessageStore {
  return {messages:new Map([[group,[row(group)]],[other,[row(other)]]]),chats:new Map([[group,{name:'Synthetic Garden',isGroup:true,lastMessageTime:1000}],[other,{name:'Synthetic Garden Club',isGroup:true,lastMessageTime:1000}]]),contacts:new Map()};
}
test('CLI-equivalent full and bare group ID accept a display name unrelated to ID',()=>{
  const store=fixture();
  for(const query of [group,'synthetic-group']) {
    assert.equal(filterMessages(store,{chat:query,since:new Date(0),limit:60}).length,1);
  }
});

test('name matching is case-insensitive; missing selectors do not widen results',()=>{
  const store=fixture();
  assert.throws(()=>filterMessages(store,{chat:'GARDEN'}),AmbiguousChatError);
  assert.equal(filterMessages(store,{chat:'garden club'}).length,1);
  assert.equal(filterMessages(store,{chat:'no-match'}).length,0);
  assert.equal(filterMessages(store,{chat:'synthetic-group@wrong'}).length,0);
  assert.equal(filterMessages(store,{chatName:'GARDEN'}).length,2);
  assert.equal(filterMessages(store,{chatId:group,chatName:'no-match'}).length,0);
});
test('exact IDs win over names and overlapping ID substrings; filters remain enforced',()=>{
  const store=fixture();
  store.chats.get(other)!.name=group;
  store.messages.set('synthetic-group-extra@g.us',[row('synthetic-group-extra@g.us')]);
  assert.deepEqual(filterMessages(store,{chat:group}).map(m=>m.chatId),[group]);
  assert.deepEqual(filterMessages(store,{chat:'synthetic-group'}).map(m=>m.chatId),[group]);
  assert.equal(filterMessages(store,{chat:group,isGroup:false}).length,0);
  assert.equal(filterMessages(store,{chat:group,since:new Date(2000)}).length,0);
  store.messages.set(group,[row(group,1000),row(group,2000)]);
  assert.deepEqual(filterMessages(store,{chat:group,limit:1}).map(m=>m.timestamp),[2000]);
});
test('DM full IDs and names work through the same selector',()=>{
  const store=fixture();const dm='synthetic-person@lid';
  store.messages.set(dm,[row(dm)]);store.chats.set(dm,{name:'Synthetic Person',isGroup:false,lastMessageTime:1000});
  assert.equal(filterMessages(store,{chat:dm}).length,1);
  assert.equal(filterMessages(store,{chat:'synthetic person'}).length,1);
  assert.equal(filterMessages(store,{chat:dm,isGroup:true}).length,0);
});
