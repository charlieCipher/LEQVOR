import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {initialGovernance,GovernanceEngine,checkpoint} from '../engine.mjs';
import {hash,encode} from '../protocol.mjs';
import {checkpointCommitment} from '../audit.mjs';
import {retainGovernanceArchive,restoreGovernanceArchive} from '../archive.mjs';
import {createS3CheckpointStore} from './s3-checkpoints.mjs';

test('signed archive retention/restore through S3 adapter rejects tampering, rollback, forked predecessor and missing quorum (SDK fixture, not cloud)',async()=>{
 // Disposable in-memory software keys test the existing protocol; none is a
 // real A/B/C credential and no policy/database is initialized in production.
 const keys=['A','B','C'].map(slot=>{const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=pair.publicKey.export({type:'spki',format:'der'});return {pair,pin:{slot,algorithm:'ES256',spki:spki.toString('base64'),key_id:createHash('sha256').update(spki).digest('hex')}};}),policy={domain:'leqvor-founder-policy-v1',platform:'leqvor.vercel.app',threshold:2,cooling_ms:259200000,credentials:keys.map(k=>k.pin)};
 let state=initialGovernance(policy);const baseline={archive_hash:null,checkpoint:checkpoint(state)},now=Date.now(),objects=new Map();
 const engine=new GovernanceEngine({transaction:async op=>{const next=structuredClone(state),result=await op(next);state=next;return result;}},{clock:()=>now,policyPin:async()=>hash(policy)});
 await engine.request({action:'CHANGE_ROOT_POLICY',target:hash({disposable:true})},baseline.checkpoint);
 const head=checkpoint(state),packet={checkpoint:head,approvals:keys.slice(0,2).map(k=>({slot:k.pin.slot,key_id:k.pin.key_id,signature:sign('sha256',encode(checkpointCommitment(head,k.pin.key_id)),{key:k.pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')}))};
 const writer={async send(c){assert.equal(c.input.IfNoneMatch,'*');objects.set(c.input.Key,Buffer.from(c.input.Body));return {VersionId:'fixture-version'};}},reader={async send(c){if(c.constructor.name==='GetObjectRetentionCommand')return {Retention:{Mode:'GOVERNANCE',RetainUntilDate:new Date(now+86400000)}};const bytes=objects.get(c.input.Key);return {Body:Readable.from([bytes]),ContentLength:bytes.length,VersionId:'fixture-version',ServerSideEncryption:'AES256',ChecksumSHA256:createHash('sha256').update(bytes).digest('base64')};}};
 const store=createS3CheckpointStore({writer,reader,retentionUntil:new Date(now+86400000).toISOString(),clock:()=>now});
 const anchor=await retainGovernanceArchive({policy,snapshot:state,checkpoint_packet:packet,anchor:baseline,store}),archive=JSON.parse((await store.get(anchor.archive_hash)).toString());
 assert.deepEqual(restoreGovernanceArchive(archive,{policy,anchor:baseline,expectedHash:anchor.archive_hash}).snapshot,state);
 assert.throws(()=>restoreGovernanceArchive({...archive,snapshot:{...state,frozen:true}},{policy,anchor:baseline,expectedHash:anchor.archive_hash}));
 await assert.rejects(retainGovernanceArchive({policy,snapshot:state,checkpoint_packet:packet,anchor,store}));
 await assert.rejects(retainGovernanceArchive({policy,snapshot:state,checkpoint_packet:{...packet,approvals:packet.approvals.slice(0,1)},anchor:baseline,store}));
 assert.throws(()=>restoreGovernanceArchive(archive,{policy,anchor:{...baseline,archive_hash:'a'.repeat(64)},expectedHash:anchor.archive_hash}));
 assert.equal(objects.size,1);
});
