import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPatch,containerArgs} from './policy.mjs';
test('patch must target exactly one occurrence and must change source',()=>{
 assert.equal(applyPatch('a b',{edits:[{before:'a',after:'c'}]}),'c b');
 for(const patch of [{edits:[]},{edits:[{before:'a',after:'a'}]},{edits:[{before:'x',after:'b'}]}])assert.throws(()=>applyPatch('a',patch));
 assert.throws(()=>applyPatch('a a',{edits:[{before:'a',after:'b'}]}));
});
test('sandbox has no network, writable root, capabilities or shared credentials',()=>{
 const args=containerArgs('cocoa-demo-abcd','sha256:abc','/tmp/patch','runsc');
 assert(args.includes('--read-only'));assert(args.includes('none'));assert(args.includes('ALL'));assert(args.includes('no-new-privileges'));
 assert(args.includes('type=bind,src=/tmp/patch,dst=/app/apps/api/src/cards/cards.service.ts,readonly'));
 assert(!args.includes('--privileged'));assert(!args.includes('--env'));assert(!args.some(x=>x.includes('docker.sock')));
 assert.throws(()=>containerArgs('cocoa-demo-abcd','image',null,'runc'));
});
