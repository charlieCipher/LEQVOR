// @vitest-environment node
import {beforeAll,afterEach,it,expect,vi} from 'vitest';
vi.mock('../src/lib/providers',()=>({DatabaseProvider:{},ObjectStorageProvider:{}}));
import {V5VaultService} from '../src/modules/vault/V5VaultService.js';
import {VaultSession} from '../src/modules/security/VaultSession.js';
import {createVaultEnvelope,generateRecoverySecret,unlockVault} from '../src/modules/security/v5Crypto.js';
import {encryptedWrite,ciphertextEnvelope} from '../src/lib/ciphertextBoundary.js';
let vault,phrase;
const sessions=[];
beforeAll(async()=>{
 phrase=generateRecoverySecret();
 vault=encryptedWrite('vault',{...await createVaultEnvelope('owner','test-only long password',phrase),recovery_verified_at:new Date().toISOString()});
},30000);
afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()));
async function setup(){
 const session=new VaultSession();sessions.push(session);session.unlock(await unlockVault(vault,phrase,true));
 const rows=new Map(),files=new Map(),objects=new Map(),jobs=[];
 const db={
  listRecords:async()=>[...rows.values()],
  saveRecordBundle:vi.fn(async(row,file)=>{
   row={...encryptedWrite('record',row),revision:1};rows.set(row.id,row);
   if(file)files.set(file.id,encryptedWrite('file',file));return row;
  }),
  files:async(id)=>[...files.values()].filter(f=>f.record_id===id),
  updateRecord:async(id,row,revision)=>{
   if(rows.get(id).revision!==revision)throw {code:'40001'};
   row={...encryptedWrite('record',row),revision:revision+1};rows.set(id,row);return row;
  },
  deleteRecord:async(id,revision)=>{
   if(rows.get(id).revision!==revision)throw {code:'40001'};
   for(const [fid,file] of files)if(file.record_id===id){jobs.push(file.storage_path);files.delete(fid);}
   rows.delete(id);
  },
 };
 const storage={upload:async(path,e)=>objects.set(path,ciphertextEnvelope(e)),download:async(path)=>objects.get(path),remove:vi.fn(async(paths)=>paths.forEach(p=>objects.delete(p)))};
 return {session,db,storage,rows,objects,jobs,service:new V5VaultService(session,vault,db,storage)};
}
const file=()=>new File(['PRIVATE_FILE_CANARY'],'private-canary.txt',{type:'text/plain'});
it('keeps review dates encrypted and preserves review history on edits',async()=>{
 const t=await setup();
 const reviewed_at='2026-01-07T01:02:03.000Z';
 const record=await t.service.create({title:'Review record',reviewed_at},{description:'Private'});
 await t.service.update(record,{next_review_date:'2027-03-17'},{description:'Edited'});
 const [listed]=await t.service.list();
 expect(listed).toMatchObject({reviewed_at,next_review_date:'2027-03-17'});
 const wire=JSON.stringify([...t.rows.values()]);
 expect(wire).not.toContain('2027-03-17');
 expect(wire).not.toContain(reviewed_at);
 expect(wire).not.toContain('next_review_date');
});
it('clears file bytes and avoids upload when locking during a file read', async () => {
 const t = await setup();
 const bytes = new TextEncoder().encode('PRIVATE_FILE_CANARY');
 let finish;
 const attachment = { size: bytes.length, name: 'sample.txt', type: 'text/plain',
   arrayBuffer: vi.fn(() => new Promise(resolve => { finish = resolve; })) };
 const pending = t.service.create({ title: 'Pending file' }, {}, attachment);
 const rejected = expect(pending).rejects.toThrow('vault locked');
 await vi.waitFor(() => expect(attachment.arrayBuffer).toHaveBeenCalledOnce());
 t.session.lock(); finish(bytes.buffer);
 await rejected;
 expect([...bytes].every(value => value === 0)).toBe(true);
 expect(t.objects.size).toBe(0);
 expect(t.db.saveRecordBundle).not.toHaveBeenCalled();
});
it('rejects oversized files before reading bytes or dispatching writes',async()=>{
 const t=await setup(),large={size:10*1024*1024+1,arrayBuffer:vi.fn()};
 await expect(t.service.create({title:'Large file'},{},large)).rejects.toMatchObject({code:'FILE_TOO_LARGE'});
 expect(large.arrayBuffer).not.toHaveBeenCalled();expect(t.db.saveRecordBundle).not.toHaveBeenCalled();expect(t.objects.size).toBe(0);
});
it('creates, lists, reveals, downloads, edits, locks, recovers and deletes using real crypto',async()=>{
 const t=await setup();
 const created=await t.service.create({title:'PRIVATE_TITLE_CANARY',category:'Legal'},{instructions:'PRIVATE_PAYLOAD_CANARY'},file());
 const wire=JSON.stringify([...t.rows.values(),...t.objects.values(),vault]);
 expect(wire).not.toContain('PRIVATE_');expect(wire).not.toContain('private-canary.txt');
 const [listed]=await t.service.list();expect(listed.files).toBe(1);expect(listed).not.toHaveProperty('instructions');
 expect((await t.service.reveal(listed)).instructions).toBe('PRIVATE_PAYLOAD_CANARY');
 const [attachment]=await t.service.files(listed),download=await t.service.download(attachment);
 expect(download.name).toBe('private-canary.txt');expect(new TextDecoder().decode(download.bytes)).toBe('PRIVATE_FILE_CANARY');download.bytes.fill(0);
 const updated=await t.service.update(listed,{title:'Updated title'},{instructions:'Updated instructions'});
 expect(updated.revision).toBe(2);
 await expect(t.service.update(listed,{},{})).rejects.toMatchObject({code:'40001'});
 t.session.lock();await expect(t.service.reveal(updated)).rejects.toThrow('Unlock');
 const fresh=new VaultSession();sessions.push(fresh);fresh.unlock(await unlockVault(vault,phrase,true));
 const recovered=new V5VaultService(fresh,vault,t.db,t.storage);
 expect((await recovered.reveal(updated)).instructions).toBe('Updated instructions');
 await recovered.remove(updated);expect(await recovered.list()).toEqual([]);
 expect(t.jobs).toEqual([attachment.storage_path]);expect(t.storage.remove).not.toHaveBeenCalled();
 expect(t.objects.size).toBe(1);expect(created.revision).toBe(1);
});
it('preserves an uploaded file when the database committed but the response was lost',async()=>{
 const t=await setup(),commit=t.db.saveRecordBundle.getMockImplementation();
 t.db.saveRecordBundle.mockImplementation(async(...args)=>{await commit(...args);throw new Error('Response lost');});
 await expect(t.service.create({title:'Record'},{},file())).rejects.toThrow('Response lost');
 expect(t.storage.remove).not.toHaveBeenCalled();
 const [record]=await t.service.list(),[attachment]=await t.service.files(record);
 expect((await t.service.download(attachment)).bytes.length).toBeGreaterThan(0);
});
