export const SOURCE='apps/api/src/cards/cards.service.ts';
export const SCENARIO='clear-card-description-v1';
export function applyPatch(source,patch){
 if(!patch||!Array.isArray(patch.edits)||patch.edits.length<1||patch.edits.length>4)throw Error('Invalid patch');
 let result=source;
 for(const e of patch.edits){
  if(!e||typeof e.before!=='string'||!e.before||typeof e.after!=='string'||e.after.length>8000||result.split(e.before).length!==2)throw Error('Patch does not uniquely match');
  result=result.replace(e.before,e.after);
 }
 if(result===source||Buffer.byteLength(result)>80000)throw Error('Invalid patched source');
 return result;
}
export function containerArgs(name,image,patch,runtime){
 if(!/^cocoa-demo-[a-f0-9-]+$/.test(name)||runtime!=='runsc')throw Error('A gVisor sandbox is required');
 return ['run','--detach','--name',name,'--runtime',runtime,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1536m','--memory-swap','1536m','--cpus','1','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,size=512m,mode=1777',...(patch?['--mount',`type=bind,src=${patch},dst=/app/${SOURCE},readonly`]:[]),image];
}
