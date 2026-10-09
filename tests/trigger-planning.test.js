// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {TriggerPlanningService} from '../src/modules/continuity/TriggerPlanningService';
import {triggerPlan,verificationPolicy,reviewEntry,evidenceCurrency} from '../src/modules/continuity/verificationPolicy';
import {encryptedWrite} from '../src/lib/ciphertextBoundary';
import {VaultSession} from '../src/modules/security/VaultSession';
const id=()=>crypto.randomUUID();
const policy=person=>({reviewer_ids:[person.id],minimum_approvals:1,evidence_expiry_days:30,required_evidence:['PRIVATE_EVIDENCE'],instructions:'PRIVATE_NOTES'});
it('encrypts owner planning, binds references and never invokes grants',async()=>{
 const session=new VaultSession();session.unlock(await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']));
 const vault={id:id(),owner_id:id()},person={id:id(),owner_id:vault.owner_id,vault_id:vault.id},record={...person,id:id()};
 const collections={policy:[],rule:[],entry:[]};
 const db={saveTriggerPlanning:vi.fn(async(kind,row)=>{encryptedWrite(kind,row);collections[kind].push(row);return row;}),triggerPlanning:async kind=>collections[kind],inviteShare:vi.fn()};
 const service=new TriggerPlanningService(session,vault,db);
 try{
  const p=await service.savePolicy(policy(person),[person]);
  const r=await service.saveRule(p,record,{trigger_type:'EMERGENCY',authority:'VIEW'});
  await service.appendEntry(r,{kind:'EVIDENCE_REFERENCE',notes:'PRIVATE_SOURCE',observed_at:'2026-10-09T00:00:00.000Z'},record);
  expect(JSON.stringify(db.saveTriggerPlanning.mock.calls)).not.toContain('PRIVATE_');
  expect((await service.read('policy'))[0].details.manual_review).toBe(true);
  expect((await service.read('rule'))[0].details.activation_enabled).toBe(false);
  expect((await service.read('entry'))[0].details.notes).toBe('PRIVATE_SOURCE');
  expect(db.inviteShare).not.toHaveBeenCalled();
  collections.rule[0].policy_id=id();await expect(service.read('rule')).rejects.toThrow('integrity');
  expect(()=>service.saveRule({...p,owner_id:id()},record,{trigger_type:'IMMEDIATE',authority:'VIEW'})).toThrow('belong');
  expect(()=>service.savePolicy(policy(person),[{...person,vault_id:id()}])).toThrow('belong');
  expect(()=>service.appendEntry(r,{kind:'EVIDENCE_REFERENCE',observed_at:'2026-10-09T00:00:00.000Z'})).toThrow('evidence');
  expect(()=>encryptedWrite('rule',{...collections.rule[0],instructions:'plaintext'})).toThrow('transport');
  session.lock();await expect(service.read('policy')).rejects.toThrow('Unlock');
 }finally{session.dispose();}
});
it('expires evidence at the boundary without approving current or future-dated references',()=>{
 const observed_at='2026-10-09T00:00:00.000Z',now=Date.parse(observed_at);
 const entry={kind:'EVIDENCE_REFERENCE',observed_at};
 expect(evidenceCurrency({evidence_expiry_days:1},entry,now)).toBe('NEEDS_REVIEW');
 expect(evidenceCurrency({evidence_expiry_days:1},entry,now-1)).toBe('NEEDS_REVIEW');
 expect(evidenceCurrency({evidence_expiry_days:1},entry,now+86400000)).toBe('EXPIRED');
 expect(()=>reviewEntry({kind:'EVIDENCE_REFERENCE',observed_at:'2026-02-30T00:00:00.000Z'})).toThrow();
});
it('rejects unsupported activation, authorities, approval counts, expiry and ambiguous dates',()=>{
 for(const trigger_type of ['DEATH','INCAPACITY','LEGAL_EVENT'])expect(()=>triggerPlan({trigger_type,authority:'VIEW'})).toThrow();
 for(const authority of ['TRANSFER','CLAIM','OWN'])expect(()=>triggerPlan({trigger_type:'IMMEDIATE',authority})).toThrow();
 expect(()=>triggerPlan({trigger_type:'EMERGENCY',authority:'VIEW',activation_enabled:true})).toThrow();
 expect(()=>triggerPlan({trigger_type:'SPECIFIED_DATE',authority:'VIEW',specified_date:'2026-02-30'})).toThrow();
 const person={id:id()};
 for(const value of [{minimum_approvals:2},{evidence_expiry_days:0},{reviewer_ids:[person.id,person.id]},{required_evidence:[]}])expect(()=>verificationPolicy({...policy(person),...value})).toThrow();
 expect(()=>reviewEntry({kind:'OWNER_REVIEW_NOTE',outcome:'APPROVED',observed_at:'2026-10-09'})).toThrow();
 expect(()=>reviewEntry({kind:'EVIDENCE_REFERENCE',outcome:'RECORDED',observed_at:'2026-10-09'})).toThrow();
});
