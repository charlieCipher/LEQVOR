// @vitest-environment node
import {it,expect,vi,beforeEach} from 'vitest';
import {generateKeyPairSync,createHash,sign,webcrypto} from 'node:crypto';
import {initialGovernance,checkpoint,GovernanceEngine} from '../governance/engine.mjs';
import {encode,hash,approvalCommitment} from '../governance/protocol.mjs';
import {checkpointCommitment} from '../governance/audit.mjs';
import {browserAuthority,browserApproval,publicHash} from '../governance/control/browser-public.js';
import {createControlClient} from '../governance/control/console-client.js';

const now=Date.parse('2026-10-12T12:00:00Z');
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));
function fixture(){
 const keys=['A','B','C'].map(slot=>{const algorithm=slot==='A'?'RS256':'ES256',pair=generateKeyPairSync(slot==='A'?'rsa':'ec',slot==='A'?{modulusLength:2048}:{namedCurve:'prime256v1'}),der=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm,spki:der.toString('base64'),key_id:createHash('sha256').update(der).digest('hex')}};});
 const policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.pin)};
 let state=initialGovernance(policy),time=now;const head=checkpoint(state),file={policy,checkpoint:head,state:structuredClone(state)};
 const engine=new GovernanceEngine({transaction:async operation=>{const next=structuredClone(state),result=await operation(next);state=next;return result;}},{clock:()=>time,policyPin:async()=>hash(policy)});
 const session={getAccessToken:vi.fn(async()=> 'control.token.signature'),clear:vi.fn()};
 const fetchImpl=vi.fn(async(_url,options)=>{const p=JSON.parse(options.body);let result;if(p.operation==='read')result=await engine.snapshot(p.checkpoint);else if(p.operation==='request')result=await engine.request(p.command,p.checkpoint);else result=await engine.approve(p.request_id,p.approval,p.checkpoint);return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});});
 const client=createControlClient({origin:'https://admin.example',pageOrigin:'https://admin.example',policyPin:hash(policy),checkpoint:head,session,fetchImpl,clock:()=>time});
 const approve=(slot,body)=>{const k=keys.find(k=>k.pin.slot===slot);return {slot,key_id:k.pin.key_id,signature:sign('sha256',encode(body),{key:k.pair.privateKey,...(k.pin.algorithm==='ES256'?{dsaEncoding:'ieee-p1363'}:{})}).toString('base64')};};
 return {keys,policy,head,file,client,fetchImpl,session,approve,state:()=>structuredClone(state),advanceTime:ms=>{time+=ms;}};
}
it('matches Node public encoding and verifies real mixed-key authority/signatures',async()=>{
 const f=fixture();expect(await publicHash({'10':'ten','2':'two',unicode:'hello 😀',z:[null,true,4]})).toBe(hash({'10':'ten','2':'two',unicode:'hello 😀',z:[null,true,4]}));
 expect(await browserAuthority(f.file,hash(f.policy),f.head)).toEqual(f.file);
 await f.client.importAuthority(f.file);const action=await f.client.request('TRANSFER_PLATFORM_OWNERSHIP',{account:'target'});
 for(const slot of ['A','B']){const pin=f.keys.find(k=>k.pin.slot===slot).pin,a=f.approve(slot,approvalCommitment(action.request,pin.key_id));expect(await browserApproval(action.request,a,f.policy)).toEqual(a);}
});
it('rejects substituted policy/state, private fields and changed signature targets',async()=>{
 const f=fixture();for(const change of [file=>{file.state.frozen=true;},file=>{file.state.requests.fake={};},file=>{file.policy.threshold=1;},file=>{file.private_key='fake';}]){const copy=structuredClone(f.file);change(copy);await expect(f.client.importAuthority(copy)).rejects.toThrow();}
 await f.client.importAuthority(f.file);const r=await f.client.request('CHANGE_ROOT_POLICY',{revision:2}),pin=f.keys[0].pin,a=f.approve('A',approvalCommitment(r.request,pin.key_id));
 await expect(browserApproval({...r.request,target:'a'.repeat(64)},a,f.policy)).rejects.toThrow();
});
it('requires a signed advancing checkpoint, then submits only a verified local approval',async()=>{
 const f=fixture();await f.client.importAuthority(f.file);const target={account:'new-owner'},r=await f.client.request('TRANSFER_PLATFORM_OWNERSHIP',target);
 await expect(f.client.read()).rejects.toThrow(/independently/);expect(f.fetchImpl).toHaveBeenCalledTimes(1);
 const state=f.state(),head=checkpoint(state),newFile={policy:f.policy,checkpoint:head,state};
 const packet={checkpoint:head,approvals:['A','B'].map(slot=>f.approve(slot,checkpointCommitment(head,f.keys.find(k=>k.pin.slot===slot).pin.key_id)))};
 await expect(f.client.advanceAuthority(newFile,{...packet,approvals:[packet.approvals[0],packet.approvals[0]]})).rejects.toThrow();
 await f.client.advanceAuthority(newFile,packet);expect((await f.client.read()).state).toEqual(state);
 const a=f.approve('A',approvalCommitment(r.request,f.keys[0].pin.key_id));await expect(f.client.approve(r.request.request_id,a,{account:'wrong'})).rejects.toThrow();
 expect((await f.client.approve(r.request.request_id,a,target)).status).toBe('PENDING');
 expect(f.session.getAccessToken).toHaveBeenCalledWith({fresh:true});
});
it('never retries or reuses state after ambiguous mutation, and cancels stale sessions',async()=>{
 const f=fixture();await f.client.importAuthority(f.file);f.fetchImpl.mockRejectedValueOnce(new Error('Disconnected'));await expect(f.client.request('CHANGE_ROOT_POLICY',{})).rejects.toThrow();
 await expect(f.client.request('CHANGE_ROOT_POLICY',{})).rejects.toThrow(/independently/);expect(f.fetchImpl).toHaveBeenCalledTimes(1);
 await f.client.importAuthority(f.file);let resolve;f.session.getAccessToken.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const operation=f.client.read();await Promise.resolve();f.client.clear();resolve('control.token.signature');await expect(operation).rejects.toThrow(/cleared/);expect(f.fetchImpl).toHaveBeenCalledTimes(1);
});
it('rejects customer origins and enforces no-cookie, same-origin, no-redirect transport',async()=>{
 const f=fixture();expect(()=>createControlClient({origin:'https://leqvor.vercel.app',pageOrigin:'https://leqvor.vercel.app',policyPin:hash(f.policy),checkpoint:f.head,session:f.session})).toThrow();
 await f.client.importAuthority(f.file);await f.client.read();const options=f.fetchImpl.mock.calls[0][1];expect(options.credentials).toBe('omit');expect(options.redirect).toBe('error');expect(options.cache).toBe('no-store');expect(options.headers.Authorization).toBe('Bearer control.token.signature');
});
it('rejects substituted server state and oversized responses without accepting a new anchor',async()=>{
 const f=fixture();await f.client.importAuthority(f.file);
 f.fetchImpl.mockImplementationOnce(async()=>new Response(JSON.stringify({checkpoint:f.head,result:{...f.file.state,frozen:true}}),{headers:{'content-type':'application/json'}}));await expect(f.client.read()).rejects.toThrow();
 f.fetchImpl.mockImplementationOnce(async()=>new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}));await expect(f.client.read()).rejects.toThrow(/capacity/);
 expect((await f.client.read()).checkpoint).toEqual(f.head);
});
it('denies root-signature substitution for checkpoint advancement and changed server actions',async()=>{
 const f=fixture();await f.client.importAuthority(f.file);
 const reply=await f.client.request('CHANGE_ROOT_POLICY',{revision:2}),state=f.state(),head=checkpoint(state),file={policy:f.policy,checkpoint:head,state};
 const wrong={checkpoint:head,approvals:['A','B'].map(slot=>f.approve(slot,approvalCommitment(reply.request,f.keys.find(k=>k.pin.slot===slot).pin.key_id)))};
 await expect(f.client.advanceAuthority(file,wrong)).rejects.toThrow(/signature/);await expect(f.client.read()).rejects.toThrow(/independently/);
 const g=fixture();await g.client.importAuthority(g.file);const original=g.fetchImpl.getMockImplementation();g.fetchImpl.mockImplementationOnce(async(...args)=>{
  const response=await original(...args),packet=await response.json();packet.result.action='DISABLE_FOUNDER_PROTECTION';return new Response(JSON.stringify(packet),{headers:{'content-type':'application/json'}});
 });await expect(g.client.request('CHANGE_ROOT_POLICY',{revision:2})).rejects.toThrow(/changed/);await expect(g.client.read()).rejects.toThrow(/independently/);
});
it('prepares a fresh confirmation only after pinned cooling and preserves its exact proposal binding',async()=>{
 const f=fixture();await f.client.importAuthority(f.file);const target={revision:2},proposal=await f.client.request('CHANGE_ROOT_POLICY',target);
 async function advance(){const state=f.state(),head=checkpoint(state);await f.client.advanceAuthority({policy:f.policy,checkpoint:head,state},{checkpoint:head,approvals:['A','B'].map(slot=>f.approve(slot,checkpointCommitment(head,f.keys.find(k=>k.pin.slot===slot).pin.key_id)))});}
 await advance();for(const slot of ['A','B']){const approval=f.approve(slot,approvalCommitment(proposal.request,f.keys.find(k=>k.pin.slot===slot).pin.key_id));await f.client.approve(proposal.request.request_id,approval,target);await advance();}
 const before=f.fetchImpl.mock.calls.length;await expect(f.client.request('CHANGE_ROOT_POLICY',target,proposal.request.request_id)).rejects.toThrow(/not ready/);expect(f.fetchImpl).toHaveBeenCalledTimes(before);
 f.advanceTime(259200000);await expect(f.client.request('CHANGE_ROOT_POLICY',{revision:3},proposal.request.request_id)).rejects.toThrow(/not ready/);expect(f.fetchImpl).toHaveBeenCalledTimes(before);
 const confirmation=await f.client.request('CHANGE_ROOT_POLICY',target,proposal.request.request_id);expect(confirmation.request.phase).toBe('CONFIRM');expect(confirmation.request.proposal_hash).toBe(hash(proposal.request));expect(confirmation.request.expires_at).toBe(new Date(now+259200000+600000).toISOString());
});
