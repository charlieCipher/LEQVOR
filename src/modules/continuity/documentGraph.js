import {encryptRecord} from '../security/v5Crypto';
export async function documentGraph(key,record,details={}){
 const nodes=new Map([[record.id,{id:record.id,owner_id:record.owner_id,vault_id:record.vault_id,entity_type:'DOCUMENT',record_id:record.id,person_id:null}]]),edges=[];
 for(const [group,type,relation] of [['custodians','PERSON','ORIGINAL_HELD_BY'],['professionals','PERSON','ADVISED_BY'],['people','PERSON','SUBJECT_PERSON'],['assets','ASSET','APPLIES_TO']]){
  for(const id of details[group]||[]){
   if(id===record.id)throw new Error('A document cannot link to itself.');
   nodes.set(id,{id,owner_id:record.owner_id,vault_id:record.vault_id,entity_type:type,record_id:type==='ASSET'?id:null,person_id:type==='PERSON'?id:null});
   const from_entity_id=record.id,to_entity_id=id;
   edges.push({...await encryptRecord(key,{owner_id:record.owner_id,vault_id:record.vault_id,metadata:{},payload:{from_entity_id,to_entity_id,relation_type:relation}}),from_entity_id,to_entity_id,managed_record_id:record.id});
  }
 }
 return {entities:[...nodes.values()],edges};
}
