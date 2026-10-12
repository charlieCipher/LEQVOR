import {ROOT_ACTIONS,exact} from '../public-values.mjs';
import {publicHash,browserAuthority,browserRequest,browserApproval,browserCheckpointPacket} from './browser-public.js';

async function responsePacket(response){
 if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='application/json')throw new Error('Control request rejected.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw new Error('Response exceeds reviewed public-file capacity.');chunks.push(value);}}
 finally{await reader.cancel();}
 const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
}

export function createControlClient({origin,pageOrigin=location.origin,policyPin,checkpoint,session,fetchImpl=fetch,clock=Date.now}){
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||origin!==pageOrigin||url.hostname==='leqvor.vercel.app'||typeof policyPin!=='string'||!/^[a-f0-9]{64}$/.test(policyPin)||typeof session?.getAccessToken!=='function'||typeof session?.clear!=='function')throw new Error('Separate pinned control configuration and session adapter required.');
 let authority=null,pin=structuredClone(checkpoint),busy=false,dirty=false,generation=0,controller=null;
 async function exclusive(operation){if(busy)throw new Error('Wait for the current control operation.');busy=true;const stamp=generation;try{return await operation(()=>{if(stamp!==generation)throw new Error('Control session cleared.');});}finally{busy=false;}}
 async function send(packet,fresh,ensure){
  const token=await session.getAccessToken({fresh});ensure();
  if(typeof token!=='string'||!/^[A-Za-z0-9_.-]{1,8192}$/.test(token))throw new Error('Control authentication required.');
  controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),15000);
  try{
   // Once a mutation is sent its outcome can be ambiguous. Never retry or
   // reuse this checkpoint automatically, including after a network failure.
   if(fresh)dirty=true;
   const response=await fetchImpl(`${origin}/governance`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(packet),credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
   const result=await responsePacket(response);ensure();exact(result,['result','checkpoint']);return result;
  }finally{clearTimeout(timer);controller=null;}
 }
 function ready(){if(!authority||dirty)throw new Error('Import independently verified current authority before continuing.');}
 return Object.freeze({
  importAuthority(file){const copy=structuredClone(file);return exclusive(async ensure=>{const verified=await browserAuthority(copy,policyPin,pin);ensure();authority=verified;dirty=false;return structuredClone(authority);});},
  advanceAuthority(file,signedCheckpoint){return exclusive(async ensure=>{
   file=structuredClone(file);signedCheckpoint=structuredClone(signedCheckpoint);
   if(!authority)throw new Error('Import the independent initial authority first.');
   await browserCheckpointPacket(signedCheckpoint,authority.policy,pin);
   const verified=await browserAuthority(file,policyPin,signedCheckpoint.checkpoint);
   if(await publicHash(verified.state.audit.slice(0,authority.state.audit.length))!==await publicHash(authority.state.audit))throw new Error('Checkpoint audit fork rejected.');
   ensure();authority=verified;pin=structuredClone(signedCheckpoint.checkpoint);dirty=false;return structuredClone(authority);
  });},
  read(){return exclusive(async ensure=>{
   ready();const reply=await send({operation:'read',checkpoint:pin},false,ensure);
   const verified=await browserAuthority({policy:authority.policy,checkpoint:reply.checkpoint,state:reply.result},policyPin,pin);ensure();return verified;
  });},
  request(action,target,proposalId=null){return exclusive(async ensure=>{
   ready();if(!ROOT_ACTIONS.includes(action))throw new Error('Unsupported root action.');
   const artifact=structuredClone(target),digest=await publicHash(artifact);ensure();
   const proposal=proposalId?authority.state.requests[proposalId]:null;
   if(proposalId&&!proposal)throw new Error('Confirmation proposal absent from pinned state.');
   if(proposal&&(proposal.status!=='COOLING'||proposal.request.action!==action||proposal.request.target!==digest||proposal.request.governance_version!==pin.version||!Number.isSafeInteger(proposal.cooling_until)||proposal.cooling_until>clock()))throw new Error('Pinned proposal is not ready for this confirmation.');
   const reply=await send({operation:'request',command:{action,target:digest,proposal_id:proposalId},checkpoint:pin},true,ensure);
   await browserRequest(reply.result,authority,artifact,clock());
   if(reply.result.action!==action||reply.result.phase!==(proposalId?'CONFIRM':'PROPOSE')||reply.result.proposal_hash!==(proposal?await publicHash(proposal.request):null))throw new Error('Response changed the requested action.');
   ensure();return {request:reply.result,target:artifact};
  });},
  approve(requestId,approval,target){return exclusive(async ensure=>{
   approval=structuredClone(approval);target=structuredClone(target);
   ready();const entry=authority.state.requests[requestId];if(!entry||entry.status!=='PENDING')throw new Error('Pinned request is not pending.');
   await browserRequest(entry.request,authority,target,clock());await browserApproval(entry.request,approval,authority.policy);ensure();
   const reply=await send({operation:'approve',request_id:requestId,approval:structuredClone(approval),checkpoint:pin},true,ensure);
   exact(reply.result,['request_id','status','cooling_until']);if(reply.result.request_id!==requestId)throw new Error('Response request mismatch.');return reply.result;
  });},
  clear(){generation++;controller?.abort();authority=null;dirty=false;session.clear();},
 });
}
