// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {sharedFileDownload} from '../scripts/shared-file-download.mjs';
const ids=Array.from({length:6},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [owner,recipient,vault,record,grantId,fileId]=ids;
const envelope={crypto_version:'leqvor-v5',algorithm:'AES-256-GCM',aad_version:1,nonce:'AAAAAAAAAAAAAAAA',ciphertext:'AAAAAAAAAAAAAAAAAAAAAA=='};
function fixture(){
 const grant={id:grantId,owner_id:owner,recipient_id:recipient,vault_id:vault,record_id:record,permissions:'view',grant_version:1,crypto_version:'leqvor-v5'};
 const file={id:fileId,owner_id:owner,vault_id:vault,record_id:record,crypto_version:'leqvor-v5',storage_path:`${owner}/${record}/${fileId}`};
 const wrapper={grant_id:grantId,file_id:fileId,owner_id:owner,recipient_id:recipient,vault_id:vault,record_id:record,crypto_version:'leqvor-v5'};
 const bundle={grant,file,file_grant:wrapper};
 const rpc=vi.fn(async()=>({data:bundle})),download=vi.fn(async()=>({data:new Blob([JSON.stringify(envelope)])}));
 const caller={auth:{getUser:vi.fn(async()=>({data:{user:{id:recipient}}}))},rpc};
 const storage={storage:{from:vi.fn(()=>({download}))}};
 const factory=vi.fn((_url,key)=>key==='server-private'?storage:caller);
 const input={method:'POST',authorization:'Bearer private-session',body:{grant_id:grantId,file_id:fileId},env:{SUPABASE_URL:'https://awdsyhxdnyfilnzamflt.supabase.co',VITE_SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-private'},clientFactory:factory};
 return {input,bundle,rpc,download,factory,caller};
}
it('authorizes before privileged storage access and checks revocation again before returning ciphertext',async()=>{
 const f=fixture();expect(await sharedFileDownload(f.input)).toEqual({status:200,body:envelope});
 expect(f.rpc).toHaveBeenCalledTimes(2);expect(f.download).toHaveBeenCalledWith(f.bundle.file.storage_path);
 expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(f.download.mock.invocationCallOrder[0]);
 expect(f.download.mock.invocationCallOrder[0]).toBeLessThan(f.rpc.mock.invocationCallOrder[1]);
});
it('rejects pending, unrelated, expired or revoked grants without creating a privileged client',async()=>{
 const f=fixture();f.rpc.mockResolvedValue({error:{message:'PRIVATE_DATABASE_DETAILS'}});
 expect(await sharedFileDownload(f.input)).toEqual({status:404,body:{error:'Shared file unavailable.'}});
 expect(f.factory).toHaveBeenCalledTimes(1);expect(f.download).not.toHaveBeenCalled();
});
it('rejects substituted storage paths and recipient bindings before storage',async()=>{
 for(const mutate of [f=>f.bundle.file.storage_path='other/file',f=>f.bundle.grant.recipient_id=owner,f=>f.bundle.file_grant.file_id=record]){
  const f=fixture();mutate(f);expect((await sharedFileDownload(f.input)).status).toBe(404);expect(f.download).not.toHaveBeenCalled();
 }
});
it('suppresses a download revoked in flight and refuses plaintext or oversized objects',async()=>{
 const f=fixture();f.rpc.mockResolvedValueOnce({data:f.bundle}).mockResolvedValueOnce({error:{message:'revoked'}});
 expect((await sharedFileDownload(f.input)).status).toBe(404);
 for(const blob of [new Blob(['PRIVATE_CONTENT']),{size:4000001,text:vi.fn()}]){
  const g=fixture();g.download.mockResolvedValue({data:blob});expect((await sharedFileDownload(g.input)).status).toBe(404);
 }
});
it('fails closed for malformed authorization, unexpected fields, wrong method and missing configuration',async()=>{
 const f=fixture();
 for(const authorization of [undefined,[],{},'Basic token'])expect((await sharedFileDownload({...f.input,authorization})).status).toBe(401);
 expect((await sharedFileDownload({...f.input,method:'GET'})).status).toBe(405);
 expect((await sharedFileDownload({...f.input,body:{...f.input.body,path:'private'}})).status).toBe(400);
 expect((await sharedFileDownload({...f.input,env:{}})).status).toBe(503);expect(f.factory).not.toHaveBeenCalled();
});
