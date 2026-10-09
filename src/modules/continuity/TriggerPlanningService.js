import {encryptRecord,decryptRecordPayload,newId} from '../security/v5Crypto';
import {opaqueId,verificationPolicy,triggerPlan,reviewEntry} from './verificationPolicy';

// Planning only. No record-grant mutation, activation or eligibility determination.
export class TriggerPlanningService {
 constructor(session,vault,db){this.session=session;this.vault=vault;this.db=db;}
 assertOwner(row){if(row?.owner_id!==this.vault.owner_id||row?.vault_id!==this.vault.id)throw new Error('Planning item does not belong to this vault.');opaqueId(row.id);}
 savePolicy(value,people){
  const payload=verificationPolicy(value);
  for(const id of payload.reviewer_ids){const person=people?.find(p=>p.id===id);this.assertOwner(person);}
  return this.write('policy',{},payload);
 }
 saveRule(policy,record,value){this.assertOwner(policy);this.assertOwner(record);return this.write('rule',{policy_id:policy.id,record_id:record.id},triggerPlan(value));}
 appendEntry(rule,value,evidenceRecord){
  this.assertOwner(rule);const payload=reviewEntry(value);
  if(payload.kind==='EVIDENCE_REFERENCE'&&!evidenceRecord)throw new Error('Select an encrypted evidence record.');
  if(evidenceRecord)this.assertOwner(evidenceRecord);
  return this.write('entry',{rule_id:rule.id,...(evidenceRecord?{evidence_record_id:evidenceRecord.id}:{})},payload);
 }
 write(kind,links,payload){
  return this.session.run(async(key,assertActive)=>{
   const identity={id:newId(),owner_id:this.vault.owner_id,vault_id:this.vault.id};
   const binding={kind,id:identity.id,...links};
   const encrypted=await encryptRecord(key,{...identity,metadata:{},payload:{binding,details:payload}});
   assertActive();const row=await this.db.saveTriggerPlanning(kind,{...encrypted,...links});assertActive();this.assertOwner(row);
   return row;
  });
 }
 read(kind){
  if(!['policy','rule','entry'].includes(kind))throw new Error('Invalid planning collection.');
  return this.session.run(async(key,assertActive)=>{
   const rows=await this.db.triggerPlanning(kind);assertActive();
   const result=await Promise.all(rows.map(async row=>{
    this.assertOwner(row);const payload=await decryptRecordPayload(key,row);
    const expected={kind,id:row.id,...(kind==='rule'?{policy_id:row.policy_id,record_id:row.record_id}:{}),...(kind==='entry'?{rule_id:row.rule_id,...(row.evidence_record_id?{evidence_record_id:row.evidence_record_id}:{})}:{})};
    if(JSON.stringify(payload.binding)!==JSON.stringify(expected))throw new Error('Planning integrity check failed.');
    if((kind==='policy'&&payload.details?.manual_review!==true)||(kind!=='policy'&&payload.details?.activation_enabled!==false))throw new Error('Planning safety check failed.');
    const validate=kind==='policy'?verificationPolicy:kind==='rule'?triggerPlan:reviewEntry;
    const details={...payload.details};delete details.manual_review;delete details.activation_enabled;
    return {...row,details:validate(details)};
   }));assertActive();return result;
  });
 }
}
