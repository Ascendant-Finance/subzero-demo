// Immutable oracle, executed in its own process. Model-generated code cannot edit it.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const mode=process.argv[2];
if(!['baseline','fixed','ready'].includes(mode))throw Error('Unknown probe');
const base='http://127.0.0.1:4000/api';
if(mode==='ready') {const r=await fetch(base+'/auth/me');if(r.status!==401)process.exit(1);process.exit(0);}
let token='';
async function call(method,path,body,expected=200){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
 assert.equal(r.status,expected,`${method} ${path}`);return r.json();
}
const user=await call('POST','/auth/register',{email:`cocoa-${randomUUID()}@example.invalid`,name:'Cocoa preview',password:'demo-preview-password'},201);token=user.accessToken;
const {workspace}=await call('POST','/workspaces',{name:'Private Cocoa preview'},201);
const {board}=await call('POST',`/workspaces/${workspace.id}/boards`,{title:'Verified card fix'},201);
const {list}=await call('POST',`/boards/${board.id}/lists`,{title:'To do'},201);
const {card}=await call('POST',`/lists/${list.id}/cards`,{title:'The card title must survive'},201);
await call('PATCH',`/cards/${card.id}`,{description:'Before clearing'});
if(mode==='baseline') {
 await call('PATCH',`/cards/${card.id}`,{description:null},500);
 console.log(JSON.stringify({baselineFailed:true}));
} else {
 await call('PATCH',`/cards/${card.id}`,{description:null});
 let detail=await call('GET',`/cards/${card.id}`);
 assert.equal(detail.card.description,null);assert.equal(detail.card.title,card.title);
 await call('PATCH',`/cards/${card.id}`,{description:'  Updated text  '});
 detail=await call('GET',`/cards/${card.id}`);assert.equal(detail.card.description,'Updated text');
 await call('PATCH',`/cards/${card.id}`,{title:'Updated title'});
 detail=await call('GET',`/cards/${card.id}`);assert.equal(detail.card.description,'Updated text');assert.equal(detail.card.title,'Updated title');
 token='';await call('PATCH',`/cards/${card.id}`,{description:null},401);
 console.log(JSON.stringify({fixedPassed:true,checks:['clear persists null','title preserved','text updates trimmed','omitted description preserved','authentication retained']}));
}
