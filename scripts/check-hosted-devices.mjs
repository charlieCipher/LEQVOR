import {randomBytes} from 'node:crypto';
import {createServer} from 'vite';
import {createVaultEnvelope,generateRecoverySecret,unlockVault} from '../src/modules/security/v5Crypto.js';
import {encryptedWrite} from '../src/lib/ciphertextBoundary.js';
const value=async request=>{const r=await request;if(r.error)throw new Error('Backend request rejected');return r.data;};
const check=condition=>{if(!condition)throw new Error('Acceptance check failed');};
export async function runHostedDevices(a,b,report=()=>{}){
 let server,vault,session,stage='setup',success=false,clean=true;
 try{
  server=await createServer({server:{middlewareMode:true},appType:'custom'});
  stage='load client services';
  const {VaultSession}=await server.ssrLoadModule('/src/modules/security/VaultSession.js');
  const {VerifiedDeviceService}=await server.ssrLoadModule('/src/modules/sessions/VerifiedDeviceService.js');
  const {readHistoryCheckpoints}=await server.ssrLoadModule('/src/modules/security/historyCheckpointStore.js');
  stage='authenticate ordinary clients';const owner=(await value(a.auth.getUser())).user.id,other=(await value(b.auth.getUser())).user.id;check(owner!==other);
  stage='create encrypted device fixture vault';
  const phrase=generateRecoverySecret();vault=await createVaultEnvelope(owner,randomBytes(32).toString('base64url'),phrase);
  await value(a.from('vaults').insert(encryptedWrite('vault',{...vault,recovery_verified_at:new Date().toISOString()})));
  stage='unlock device fixture';
  session=new VaultSession();session.unlock(await unlockVault(vault,phrase,true));
  let local=null,lastBody;const retained=new Map();
  const store={get:async()=>local,add:async(_scope,row)=>{local=row;},remove:async()=>{local=null;}};
  const checkpoints={getItem:k=>retained.get(k)??null,setItem:(k,v)=>retained.set(k,v),removeItem:k=>retained.delete(k)};
  const post=async(client,body)=>{const {session:s}=await value(client.auth.getSession());return fetch('https://leqvor.vercel.app/api/verified-device',{method:'POST',headers:{Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});};
  const db={
   devices:()=>value(a.from('vault_devices').select('*').eq('vault_id',vault.id)),
   securityEvents:()=>value(a.from('security_events').select('*').order('sequence')),
   reviewSigningIdentity:()=>value(a.from('review_signing_keys').select('*').maybeSingle()),
   registerReviewSigningIdentity:row=>{const {public_key,...encrypted}=row;const {kty,crv,x,y}=public_key;return value(a.rpc('register_v5_review_signing_key',{key_data:{...encryptedWrite('policy',encrypted),public_key:{kty,crv,x,y}}}));},
   beginDeviceChallenge:(v,id,purpose,key)=>value(a.rpc('begin_v5_device_challenge',{target_vault:v,target_device:id,operation:purpose,key_data:key})),
   completeDeviceChallenge:async(id,signature,event)=>{
    const body={challenge_id:id,signature,event};
    check(!(await post(a,{...body,signature:'A'.repeat(86)+'=='})).ok);
    check(!(await post(b,body)).ok);
    const response=await post(a,body);check(response.ok&&response.headers.get('cache-control')?.includes('no-store'));
    const result=await response.json();check(result.verified===true);lastBody=body;return result.device_id;
   },
   revokeDevice:async(id,event)=>{const response=await post(a,{operation:'revoke',device_id:id,event});check(response.ok);return (await response.json()).device_id;}
  };
  const service=new VerifiedDeviceService(session,vault,db,store,checkpoints);
  stage='hosted enrollment';const id=await service.verify();check(local.privateKey.extractable===false);check((await service.list())[0].current);
  check(!(await post(a,lastBody)).ok);
  check((await value(b.from('vault_devices').select('*').eq('owner_id',owner))).length===0);
  check((await value(b.from('device_challenges').select('*').eq('owner_id',owner))).length===0);
  stage='hosted subsequent proof';await service.verify();check(!(await post(a,lastBody)).ok);
  stage='hosted revocation';const publicKey=local.public_key;await service.revoke(id);check(local===null);
  check(!!(await a.rpc('begin_v5_device_challenge',{target_vault:vault.id,target_device:id,operation:'verify',key_data:publicKey})).error);
  stage='signed chain readback';const anchor=readHistoryCheckpoints(service.history,checkpoints).anchor;
  const history=await service.history.snapshot(anchor);check(history.state==='VERIFIED'&&history.events.length===3);
  check(history.events.map(e=>e.event_type).join(',')==='DEVICE_ENROLLED,DEVICE_PROOF_VERIFIED,DEVICE_REVOKED');
  check((await value(b.from('security_events').select('*').eq('owner_id',owner))).length===0);
  report('PASS deployed device enrollment, proof, revocation, signature/replay rejection, signed-chain verification and two-account isolation');success=true;
 }catch{report(`FAIL ${stage}; sensitive responses suppressed`);}
 finally{session?.dispose();if(vault)try{await value(a.from('vaults').delete().eq('id',vault.id));}catch{clean=false;report('FAIL disposable device vault cleanup');}await server?.close();}
 return success&&clean;
}
