// @vitest-environment node
import {afterEach,it,expect,vi} from 'vitest';
const sdk=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),storage:{from:vi.fn()},auth:{getSession:vi.fn(),mfa:{getAuthenticatorAssuranceLevel:vi.fn(),listFactors:vi.fn(),challengeAndVerify:vi.fn()}}}));
vi.mock('../src/supabase',()=>({supabase:sdk,supabaseConfig:{passkeysEnabled:false}}));
import {DatabaseProvider,ObjectStorageProvider,AuthProvider} from '../src/lib/providers';
const envelope={crypto_version:'leqvor-v5',algorithm:'AES-256-GCM',aad_version:1,nonce:'AAAAAAAAAAAAAAAA',ciphertext:'AAAAAAAAAAAAAAAAAAAAAA=='};
const row={id:'id',owner_id:'owner',vault_id:'vault',crypto_version:'leqvor-v5',encrypted_metadata:envelope,encrypted_payload:envelope,wrapped_dek:envelope};
afterEach(()=>vi.resetAllMocks());
it('sends the record and file together through the bundle RPC',async()=>{
 sdk.rpc.mockResolvedValue({data:{...row,revision:1},error:null});
 const file={id:'file',owner_id:'owner',vault_id:'vault',record_id:'id',crypto_version:'leqvor-v5',encrypted_filename:envelope,wrapped_file_dek:envelope,storage_path:'owner/id/file'};
 expect((await DatabaseProvider.saveRecordBundle(row,file)).revision).toBe(1);
 expect(sdk.rpc).toHaveBeenCalledWith('save_v5_record_bundle',{record_data:row,file_data:file});
});
it('rejects accidental plaintext before issuing an RPC',()=>{
 expect(()=>DatabaseProvider.saveRecordBundle({...row,title:'SECRET_CANARY'},null)).toThrow();
 expect(sdk.rpc).not.toHaveBeenCalled();
});
it('passes the expected revision and preserves conflict codes',async()=>{
 sdk.rpc.mockResolvedValue({data:null,error:{code:'40001',message:'stale'}});
 await expect(DatabaseProvider.updateRecord('id',row,7)).rejects.toMatchObject({code:'40001'});
 expect(sdk.rpc).toHaveBeenCalledWith('update_v5_record',{target_id:'id',expected_revision:7,record_data:row});
});
it('sends deletion through the transaction without direct table mutation',async()=>{
 sdk.rpc.mockResolvedValue({data:null,error:null});
 await DatabaseProvider.deleteRecord('id',7);
 expect(sdk.rpc).toHaveBeenCalledWith('delete_v5_record',{target_id:'id',expected_revision:7});
 expect(sdk.from).not.toHaveBeenCalled();
});
it('uploads an encrypted JSON object without overwrite permission',async()=>{
 const upload=vi.fn().mockResolvedValue({data:{},error:null});sdk.storage.from.mockReturnValue({upload});
 await ObjectStorageProvider.upload('owner/record/file',envelope);
 expect(sdk.storage.from).toHaveBeenCalledWith('vault-v5');
 const [path,blob,options]=upload.mock.calls[0];
 expect(path).toBe('owner/record/file');expect(JSON.parse(await blob.text())).toEqual(envelope);
 expect(options.upsert).toBe(false);
});
it('unwraps authentication and MFA provider responses',async()=>{
 sdk.auth.getSession.mockResolvedValue({data:{session:{user:{id:'owner'}}},error:null});
 sdk.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null});
 expect((await AuthProvider.session()).session.user.id).toBe('owner');
 expect((await AuthProvider.assurance()).currentLevel).toBe('aal2');
});
