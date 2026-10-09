import {encryptRecord} from '../security/v5Crypto';

// Relationships describe recorded policy roles, never access or entitlement.
// "self" remains in encrypted policy data: an account is not a person entity.
export async function insuranceGraph(key,record,policy={}) {
 const nodes=new Map(),edges=[];
 const node=(id,type)=>{
  if(nodes.has(id)&&nodes.get(id).entity_type!==type)throw new Error('Conflicting policy relationship types.');
  nodes.set(id,{id,owner_id:record.owner_id,vault_id:record.vault_id,entity_type:type,person_id:type==='PERSON'?id:null,record_id:type==='PERSON'?null:id});
 };
 node(record.id,'POLICY');
 const groups=[['owner_id','PERSON','POLICY_OWNER',false],['insured_ids','PERSON','INSURED_PERSON',false],['beneficiary_ids','PERSON','BENEFICIARY_OF',true],['trusted_ids','PERSON','TRUSTED_FOR',true],['asset_ids','ASSET','INSURED_BY',true]];
 for(const [group,type,relation,incoming] of groups) {
  const ids=group==='owner_id'?[policy[group]]:policy[group]||[];
  for(const id of new Set(ids.filter(id=>id&&id!=='self'))) {
   if(id===record.id)throw new Error('A policy cannot link to itself.');
   node(id,type);
   const from_entity_id=incoming?id:record.id,to_entity_id=incoming?record.id:id;
   edges.push({...await encryptRecord(key,{owner_id:record.owner_id,vault_id:record.vault_id,metadata:{},payload:{from_entity_id,to_entity_id,relation_type:relation}}),from_entity_id,to_entity_id,managed_record_id:record.id});
  }
 }
 return {entities:[...nodes.values()],edges};
}
