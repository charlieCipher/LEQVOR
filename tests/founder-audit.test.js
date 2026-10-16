// @vitest-environment node
import {it,expect} from 'vitest';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {initialGovernance,checkpoint} from '../governance/engine.mjs';
import {encode,approvalCommitment} from '../governance/protocol.mjs';
import {verifySnapshot,verifyCheckpointPacket,checkpointCommitment} from '../governance/audit.mjs';
function fixture(){
 const keys=['A','B','C'].map(slot=>{const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),der=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm:'ES256',spki:der.toString('base64'),key_id:createHash('sha256').update(der).digest('hex')}};});
 const policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.pin)},state=initialGovernance(policy),head=checkpoint(state);
 const approve=(slot,body=checkpointCommitment(head,keys.find(k=>k.pin.slot===slot).pin.key_id))=>{const k=keys.find(k=>k.pin.slot===slot);return {slot,key_id:k.pin.key_id,signature:sign('sha256',encode(body),{key:k.pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')};};
 return {keys,policy,state,head,approve};
}
it('verifies current independent snapshot and denies changed public state, policy and history',()=>{
 const f=fixture();expect(verifySnapshot(f.state,f.head,f.policy)).toEqual(f.state);
 for(const alteration of [s=>{s.frozen=true;},s=>{s.requests.fake={status:'AUTHORIZED'};},s=>{s.audit=[];s.version=2;}]){const state=structuredClone(f.state);alteration(state);expect(()=>verifySnapshot(state,f.head,f.policy)).toThrow();}
 expect(()=>verifySnapshot({...f.state,private_key:'not-accepted'},f.head,f.policy)).toThrow();
});
it('requires two distinct checkpoint signatures and prevents using root-action signatures as checkpoint evidence',()=>{
 const f=fixture(),packet={checkpoint:f.head,approvals:[f.approve('A'),f.approve('B')]};expect(verifyCheckpointPacket(packet,f.policy)).toBe(true);
 expect(verifyCheckpointPacket({...packet,approvals:[packet.approvals[0]]},f.policy)).toBe(false);
 expect(verifyCheckpointPacket({...packet,approvals:[packet.approvals[0],packet.approvals[0]]},f.policy)).toBe(false);
 expect(verifyCheckpointPacket({...packet,checkpoint:{...f.head,state_hash:'a'.repeat(64)}},f.policy)).toBe(false);
 expect(verifyCheckpointPacket({...packet,approvals:[f.approve('A',approvalCommitment(f.head,f.keys[0].pin.key_id)),f.approve('B')]},f.policy)).toBe(false);
});
it('rejects rollback and repeated checkpoints relative to retained history',()=>{
 const f=fixture(),packet={checkpoint:f.head,approvals:[f.approve('A'),f.approve('B')]};
 expect(verifyCheckpointPacket(packet,f.policy,f.head)).toBe(false);
 expect(verifyCheckpointPacket(packet,f.policy,{...f.head,sequence:1,event_hash:'a'.repeat(64)})).toBe(false);
});
