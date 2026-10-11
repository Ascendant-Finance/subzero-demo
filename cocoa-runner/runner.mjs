// Trusted orchestration process on a dedicated runner. Never run it on the API host.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {SOURCE,SCENARIO,applyPatch,containerArgs,validateRuntime} from './policy.mjs';
const exec=promisify(execFile);
const api=process.env.COCOA_DEMO_API_URL;
const secret=process.env.COCOA_DEMO_RUNNER_SECRET;
const image=process.env.COCOA_DEMO_IMAGE;
const revision=process.env.COCOA_DEMO_REVISION;
const runtime=process.env.COCOA_DEMO_RUNTIME;
const allowStandardDocker=process.env.COCOA_DEMO_ALLOW_STANDARD_DOCKER==='true';
validateRuntime(runtime,allowStandardDocker);
if(!api?.startsWith('https://')||!secret||secret.length<32||!image||!/^sha256:[a-f0-9]{64}$/.test(image)||!revision?.match(/^[a-f0-9]{40}$/))throw Error('Configure HTTPS API, secret, immutable image digest, pinned revision and an explicitly configured sandbox runtime');
let stopping=false;const active=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function docker(args,timeout=120000){return (await exec('docker',args,{timeout,maxBuffer:1024*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME}})).stdout.trim();}
async function request(path,body,lease){
 const r=await fetch(api.replace(/\/$/,'')+'/demo-cocoa/runner'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Cocoa-Runner-Secret':secret,...(lease?{'X-Cocoa-Lease':lease}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(65000)});
 if(!r.ok)throw Error('Cocoa coordinator rejected the request ('+r.status+')');
 const text=await r.text();return text?JSON.parse(text):null;
}
async function remove(name){await docker(['rm','-f',name],20000).catch(()=>{});active.delete(name);}
async function start(name,patch){
 active.add(name);await docker(containerArgs(name,image,patch,runtime,allowStandardDocker));
 for(let n=0;n<100&&!stopping;n++){
  try{await docker(['exec',name,'node','/opt/cocoa/probe.mjs','ready'],5000);return;}catch{await sleep(1000);}
 }
 throw Error('Sandbox did not become ready');
}
async function probe(name,mode){const result=JSON.parse(await docker(['exec',name,'node','/opt/cocoa/probe.mjs',mode],60000));if(result[mode==='baseline'?'baselineFailed':'fixedPassed']!==true)throw Error('Verification failed');return result;}
const label=await docker(['image','inspect',image,'--format','{{index .Config.Labels "dev.subzero.cocoa.revision"}}']);
if(label!==revision)throw Error('Image does not match pinned source revision');
// Remove only this runner's named disposable containers left after an interrupted run.
for(const name of (await docker(['ps','-a','--filter','name=^cocoa-demo-','--format','{{.Names}}'])).split('\n').filter(Boolean))if(/^cocoa-demo-[a-f0-9-]+$/.test(name))await remove(name);
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;void Promise.all([...active].map(remove));});
await request('/heartbeat',{revision});
const heartbeat=setInterval(()=>void request('/heartbeat',{revision}).catch(()=>{}),15000);
heartbeat.unref();
while(!stopping){
 let job;
 try{job=await request('/claim',{});}catch{console.error('Coordinator unavailable');await sleep(5000);continue;}
 if(!job){await sleep(3000);continue;}
 if(job.revision!==revision||job.scenario!==SCENARIO||job.source!==SOURCE){await request('/'+job.id+'/fail',{},job.lease).catch(()=>{});continue;}
 const name='cocoa-demo-'+job.id;
 const dir=await mkdtemp(join(tmpdir(),'cocoa-demo-'));await chmod(dir,0o755);
 let verified=false;
 // The host enforces a hard wall clock independently of model-controlled processes.
 const timer=setTimeout(()=>{void remove(name);},11*60*1000);
 try{
  await start(name);
  const baseline=await probe(name,'baseline');
  const source=await docker(['exec',name,'cat','/app/'+SOURCE]);
  await remove(name);
  const patch=await request('/'+job.id+'/model',{source},job.lease);
  const file=resolve(dir,'cards.service.ts');await writeFile(file,applyPatch(source,patch),{mode:0o644});
  await request('/'+job.id+'/progress',{stage:'testing'},job.lease);
  await start(name,file);const fixed=await probe(name,'fixed');
  await request('/'+job.id+'/finish',{baselineFailed:baseline.baselineFailed,fixedPassed:fixed.fixedPassed,revision,scenario:SCENARIO},job.lease);verified=true;
  const until=Date.now()+5*60*1000;
  while(!stopping&&Date.now()<until){
   const p=await request('/'+job.id+'/preview',undefined,job.lease);
   if(p.requested){let passed=false;try{passed=(await probe(name,'fixed')).fixedPassed===true;}catch{}await request('/'+job.id+'/preview',{passed},job.lease);}
   await sleep(2000);
  }
 }catch{console.error(JSON.stringify({run:job.id,event:verified?'preview_closed':'verification_failed'}));if(!verified)await request('/'+job.id+'/fail',{},job.lease).catch(()=>{});}
 finally{clearTimeout(timer);await remove(name);await rm(dir,{recursive:true,force:true});}
}

clearInterval(heartbeat);
