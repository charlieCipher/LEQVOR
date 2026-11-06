import {createHash} from 'node:crypto';
import {S3Client,PutObjectCommand,GetObjectCommand,GetObjectRetentionCommand} from '@aws-sdk/client-s3';
import {STSClient,GetCallerIdentityCommand} from '@aws-sdk/client-sts';
import {fromTokenFile} from '@aws-sdk/credential-providers';
import {resolve} from 'node:path';

export const checkpointBucket='leqvor-gov-checkpoints-533047842985-ap-southeast-2-an';
export const checkpointRegion='ap-southeast-2';
const account='533047842985',prefix='governance/archives/',maxBytes=4194304;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function key(hash){if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw new Error('Independent archive digest required.');return `${prefix}${hash}.json`;}
async function boundedBody(body){
 if(!body||typeof body[Symbol.asyncIterator]!=='function')throw new Error('Bounded S3 body required.');
 const chunks=[];let size=0;try{for await(const chunk of body){size+=chunk.length;if(size>maxBytes)throw new Error('Checkpoint too large.');chunks.push(chunk);}return Buffer.concat(chunks);}finally{body.destroy?.();}
}
export function createS3CheckpointStore({writer,reader,retentionUntil,clock=Date.now}){
 if(typeof reader?.send!=='function'||writer&&typeof writer.send!=='function')throw new Error('Explicit separate S3 identities required.');
 if(writer&&(typeof retentionUntil!=='string'||new Date(retentionUntil).toISOString()!==retentionUntil||Date.parse(retentionUntil)<=clock()))throw new Error('Explicit approved future retention date required.');
 const receipts=[];
 async function read(hash,versionId){
  const object=await reader.send(new GetObjectCommand({Bucket:checkpointBucket,Key:key(hash),...(versionId?{VersionId:versionId}:{}),ExpectedBucketOwner:account,ChecksumMode:'ENABLED'}),{abortSignal:AbortSignal.timeout(4000)});
  if(!object.VersionId||object.VersionId==='null'||object.ServerSideEncryption!=='AES256'||!Number.isSafeInteger(object.ContentLength)||object.ContentLength<1||object.ContentLength>maxBytes)throw new Error('Versioned encrypted checkpoint required.');
  const bytes=await boundedBody(object.Body);
  if(bytes.length!==object.ContentLength||digest(bytes)!==hash||object.ChecksumSHA256!==createHash('sha256').update(bytes).digest('base64'))throw new Error('Checkpoint integrity mismatch.');
  const lock=await reader.send(new GetObjectRetentionCommand({Bucket:checkpointBucket,Key:key(hash),VersionId:object.VersionId,ExpectedBucketOwner:account}),{abortSignal:AbortSignal.timeout(4000)});
  if(!['GOVERNANCE','COMPLIANCE'].includes(lock.Retention?.Mode)||!(lock.Retention.RetainUntilDate instanceof Date)||lock.Retention.RetainUntilDate.getTime()<=clock()||retentionUntil&&lock.Retention.RetainUntilDate.getTime()<Date.parse(retentionUntil))throw new Error('Checkpoint retention verification failed.');
  receipts.push({operation:'verified-read',archive_hash:hash,version_id:object.VersionId,retained_until:lock.Retention.RetainUntilDate.toISOString()});return bytes;
 }
 return Object.freeze({
  async putIfAbsent(hash,bytes){
   if(!writer||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>maxBytes||digest(bytes)!==hash||Date.parse(retentionUntil)<=clock())throw new Error('Approved immutable checkpoint write required.');
   const body=Buffer.from(bytes);let result;
   try{result=await writer.send(new PutObjectCommand({Bucket:checkpointBucket,Key:key(hash),ExpectedBucketOwner:account,Body:body,ContentType:'application/json',IfNoneMatch:'*',ServerSideEncryption:'AES256',ChecksumSHA256:createHash('sha256').update(body).digest('base64'),ObjectLockMode:'GOVERNANCE',ObjectLockRetainUntilDate:new Date(retentionUntil)}),{abortSignal:AbortSignal.timeout(4000)});}
   catch(error){
    // A 412 is acceptable only if the independently read current version is
    // byte-identical and still retained. All ambiguous/409 writes fail closed.
    if(error?.$metadata?.httpStatusCode!==412)throw new Error('Checkpoint write failed; reconcile before retry.');
    const existing=await read(hash);if(!existing.equals(body))throw new Error('Existing checkpoint mismatch.');return;
   }
   if(!result.VersionId||result.VersionId==='null')throw new Error('Checkpoint version receipt missing.');
   const retained=await read(hash,result.VersionId);if(!retained.equals(body))throw new Error('Checkpoint read-back mismatch.');
   receipts.push({operation:'retained',archive_hash:hash,version_id:result.VersionId});
  },
  get:hash=>read(hash),
  receipts:()=>structuredClone(receipts),
 });
}

// Deliberately no default provider chain or permanent AWS access-key fallback.
// A writer and independently operated reader use DIFFERENT approved roles. The
// runtime does not manufacture a second identity by reusing one credential.
export async function connectFederatedCheckpointIdentity({roleArn,tokenFile,sessionName,clock=Date.now},{credentialFactory=fromTokenFile,STS=STSClient,S3=S3Client}={}){
 if(typeof roleArn!=='string'||!new RegExp(`^arn:aws:iam::${account}:role/[A-Za-z0-9_+=,.@/-]{1,128}$`).test(roleArn)||typeof tokenFile!=='string'||resolve(tokenFile)!==tokenFile||!/^leqvor-[a-z0-9-]{1,40}$/.test(sessionName))throw new Error('Reviewed AWS federation role and token file required.');
 const credentials=credentialFactory({roleArn,webIdentityTokenFile:tokenFile,roleSessionName:sessionName,clientConfig:{region:checkpointRegion,maxAttempts:1}});
 const issued=await credentials();if(!issued.sessionToken||!(issued.expiration instanceof Date)||issued.expiration.getTime()<=clock()||issued.expiration.getTime()>clock()+3600000)throw new Error('Short-lived AWS credentials required.');
 const sts=new STS({region:checkpointRegion,credentials,maxAttempts:1});
 try{
  const identity=await sts.send(new GetCallerIdentityCommand({})),roleName=roleArn.split('/').at(-1);
  if(identity.Account!==account||identity.Arn!==`arn:aws:sts::${account}:assumed-role/${roleName}/${sessionName}`)throw new Error('AWS workload identity mismatch.');
 }finally{sts.destroy();}
 const client=new S3({region:checkpointRegion,credentials,maxAttempts:1,followRegionRedirects:false});
 return {client,credentials,roleArn,close:()=>client.destroy()};
}
