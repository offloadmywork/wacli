import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMessages, resolveChatSelector, AmbiguousChatError, type MessageStore, type StoredMessage } from '../src/store.js';
import { ambiguousChatOutput } from '../src/chat-output.js';
const make = (): MessageStore => ({messages:new Map(),chats:new Map(),contacts:new Map()});
function put(store:MessageStore,id:string,name:string,timestamp=1000) {
  const message:StoredMessage={id:`fixture-${id}`,chatId:id,sender:'fixture',timestamp,body:'SYNTHETIC BODY MUST NOT APPEAR IN CHOICES',isFromMe:false,hasMedia:false};
  store.messages.set(id,[message]);store.chats.set(id,{name,isGroup:id.endsWith('@g.us'),lastMessageTime:timestamp});
}
test('unique partial group/contact names support Unicode normalization and case',()=>{
  const store=make();put(store,'garden@g.us','Synthetic Café Garden');put(store,'person@lid','Unrelated cached label');
  store.contacts.set('person','Synthetic Contact');
  assert.equal(resolveChatSelector(store,'CAFE\u0301'),'garden@g.us');
  assert.equal(filterMessages(store,{chat:'contact'}).length,1);
  put(store,'hebrew@g.us','קבוצת בדיקה TEST');
  assert.equal(filterMessages(store,{chat:'בדיקה test'}).length,1);
  assert.equal(filterMessages(store,{chat:'not present'}).length,0);
  assert.equal(filterMessages(store,{chat:''}).length,0);
  assert.equal(filterMessages(store,{chat:'   '}).length,0);
});
test('ambiguity fails before time/limit filters and returns safe choices without message bodies',()=>{
  const store=make();put(store,'one@g.us','Synthetic Garden\n\u202e\u009b\u2028',1000);put(store,'two@g.us','Synthetic Garden Club',3000);
  let caught:AmbiguousChatError|undefined;
  try {filterMessages(store,{chat:'garden',since:new Date(2000),limit:1});assert.fail('must refuse');}
  catch(error){assert.ok(error instanceof AmbiguousChatError);caught=error;}
  assert.equal(caught!.candidates.length,2);
  const text=ambiguousChatOutput(caught!,false),json=ambiguousChatOutput(caught!,true);
  assert.ok(text.includes('more specific selector'));assert.ok(text.includes('\\n'));assert.ok(text.includes('\\u202e'));
  assert.equal(text.includes('\u202e'),false);assert.equal(text.includes('\u009b'),false);assert.equal(text.includes('\u2028'),false);assert.equal(text.split('\n').length,3);
  for(const output of [text,json])assert.equal(output.includes('SYNTHETIC BODY'),false);
  assert.equal(JSON.parse(json).error,'ambiguous_chat');assert.equal(JSON.parse(json).candidates.length,2);
  assert.equal(filterMessages(store,{chat:'garden club'}).length,1);
  assert.equal(filterMessages(store,{chat:'one@g.us'}).length,1);
  assert.equal(filterMessages(store,{chat:'one'}).length,1);
});
test('distinct IDs with identical names stay ambiguous; type filter may narrow choices',()=>{
  const store=make();put(store,'one@lid','Synthetic Shared');put(store,'two@s.whatsapp.net','Synthetic Shared');put(store,'group@g.us','Synthetic Shared');
  assert.throws(()=>filterMessages(store,{chat:'shared',isGroup:false}),AmbiguousChatError);
  assert.equal(filterMessages(store,{chat:'shared',isGroup:true}).length,1);
  assert.equal(filterMessages(store,{chat:'one@lid',isGroup:true}).length,0);
});
