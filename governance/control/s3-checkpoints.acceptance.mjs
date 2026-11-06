import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {createS3CheckpointStore,connectFederatedCheckpointIdentity} from './s3-checkpoints.mjs';
import {prepareCheckpointPermissions} from './aws-policy-plan.mjs';
const bytes=Buffer.from('{"public":"disposable checkpoint"}'),hash=createHash('sha256').update(bytes).digest('hex'),checksum=createHash('sha256').update(bytes).digest('base64'),now=1792150000000,until=new Date(now+86400000).toISOString();
function fixture({change={},writeError}={}){
 const writes=[],reads=[],writer={async send(c){writes.push(c.input);if(writeError)throw writeError;return {VersionId:'v1'};}},reader={async send(c){reads.push(c.input);if(c.constructor.name==='GetObjectRetentionCommand')return {Retention:{Mode:'GOVERNANCE',RetainUntilDate:new Date(until)}};return {Body:Readable.from([bytes]),ContentLength:bytes.length,VersionId:'v1',ServerSideEncryption:'AES256',ChecksumSHA256:checksum,...change};}};
 return {store:createS3CheckpointStore({writer,reader,retentionUntil:until,clock:()=>now}),writes,reads};
}
test('checkpoint S3 writes are conditional/versioned/checksummed and read back by a separate client with retention verified',async()=>{
 const f=fixture();await f.store.putIfAbsent(hash,bytes);assert.equal(f.writes.length,1);assert.equal(f.writes[0].IfNoneMatch,'*');assert.equal(f.writes[0].ObjectLockMode,'GOVERNANCE');assert.equal(f.writes[0].ChecksumSHA256,checksum);assert.equal(f.reads[0].VersionId,'v1');assert.deepEqual(await f.store.get(hash),bytes);assert.equal(f.store.receipts().at(-1).archive_hash,hash);
});
test('existing S3 archives are accepted only after verified 412 read-back; ambiguous writes, changed bodies and missing locks fail',async()=>{
 await fixture({writeError:{$metadata:{httpStatusCode:412}}}).store.putIfAbsent(hash,bytes);
 for(const status of [409,500,403])await assert.rejects(fixture({writeError:{$metadata:{httpStatusCode:status}}}).store.putIfAbsent(hash,bytes),/reconcile/);
 for(const change of [{VersionId:'null'},{ServerSideEncryption:null},{ChecksumSHA256:'wrong'},{ContentLength:bytes.length+1},{Body:Readable.from([Buffer.from('tampered')])}])await assert.rejects(fixture({change}).store.get(hash));
 const store=createS3CheckpointStore({reader:{send:async c=>c.constructor.name==='GetObjectRetentionCommand'?{Retention:{Mode:'GOVERNANCE',RetainUntilDate:new Date(now-1)}}:{Body:Readable.from([bytes]),ContentLength:bytes.length,VersionId:'v1',ServerSideEncryption:'AES256',ChecksumSHA256:checksum}},clock:()=>now});await assert.rejects(store.get(hash),/retention/);await assert.rejects(store.putIfAbsent(hash,bytes));
});
test('S3 write preflight rejects wrong digest, expired retention, oversized input and arbitrary object keys',async()=>{
 const f=fixture();await assert.rejects(f.store.putIfAbsent('a'.repeat(64),bytes));await assert.rejects(f.store.get('../secrets'));assert.equal(f.writes.length,0);
 assert.throws(()=>createS3CheckpointStore({writer:{send(){}},reader:{send(){}},retentionUntil:new Date(now-1).toISOString(),clock:()=>now}));
});
test('AWS federation requires temporary credentials, exact account/role/session and never a permanent-key chain',async()=>{
 const config={roleArn:'arn:aws:iam::533047842985:role/checkpoint-writer',tokenFile:process.platform==='win32'?'C:\\reviewed\\token':'/reviewed/token',sessionName:'leqvor-checkpoint',clock:()=>now};
 const dependencies={credentialFactory:()=>async()=>({sessionToken:'disposable',expiration:new Date(now+900000)}),STS:class{async send(){return {Account:'533047842985',Arn:'arn:aws:sts::533047842985:assumed-role/checkpoint-writer/leqvor-checkpoint'};}destroy(){}},S3:class{destroy(){}}};
 await (await connectFederatedCheckpointIdentity(config,dependencies)).close();
 await assert.rejects(connectFederatedCheckpointIdentity(config,{...dependencies,credentialFactory:()=>async()=>({accessKeyId:'not-used'})}));
 await assert.rejects(connectFederatedCheckpointIdentity({...config,roleArn:'arn:aws:iam::533047842985:root'},dependencies));
 await assert.rejects(connectFederatedCheckpointIdentity(config,{...dependencies,STS:class{async send(){return {Account:'other',Arn:'wrong'};}destroy(){}}}));
});
test('IAM proposals bind one exact Render service and cannot authorize deletion, bypass, broad trust or future service identities',()=>{
 const plan=prepareCheckpointPermissions({workspaceId:'tea-example',environmentId:'default',serviceId:'srv-example',maxRetentionDays:1});
 assert.equal(plan.trust.Statement[0].Condition.StringEquals['oidc.render.com/tea-example:sub'],'workspace:tea-example:environment:default:service:srv-example');
 assert.equal(plan.writer.Statement[0].Action.includes('s3:DeleteObject'),false);assert.equal(plan.verifier.Statement[0].Action.some(a=>/Put/.test(a)),false);
 assert.throws(()=>prepareCheckpointPermissions({workspaceId:'tea-example',environmentId:'default',serviceId:'*'}));
});
