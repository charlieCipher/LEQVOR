import {encryptRecord} from '../security/v5Crypto';
export async function assetGraph(key,record,asset={}){
 const nodes=new Map(),edges=[];
 const node=(id,type)=>{
  if(nodes.has(id)&&nodes.get(id).entity_type!==type)throw new Error('Conflicting asset relationship types.');
  nodes.set(id,{id,owner_id:record.owner_id,vault_id:record.vault_id,entity_type:type,person_id:type==='PERSON'?id:null,record_id:type==='PERSON'?null:id});
 };
 node(record.id,'ASSET');
 async function edge(id,type,relation,incoming,allocation){
  if(id===record.id)throw new Error('An asset cannot link to itself.');
  node(id,type);
  const from_entity_id=incoming?id:record.id,to_entity_id=incoming?record.id:id;
  const payload={from_entity_id,to_entity_id,relation_type:relation,...(allocation==null?{}:{allocation_bps:allocation})};
  edges.push({...await encryptRecord(key,{owner_id:record.owner_id,vault_id:record.vault_id,metadata:{},payload}),from_entity_id,to_entity_id,managed_record_id:record.id});
 }
 for(const [group,relation] of [['owners','OWNS'],['nominees','NOMINEE_FOR'],['beneficiaries','BENEFICIARY_OF']])
  for(const row of asset[group]||[])await edge(row.person_id,'PERSON',relation,true,row.allocation_bps);
 for(const [group,type,relation,incoming] of [['documents','DOCUMENT','SUPPORTED_BY',false],['policies','POLICY','INSURED_BY',false],['instructions','INSTRUCTION','RELATES_TO',true]])
  for(const id of asset[group]||[])await edge(id,type,relation,incoming);
 return {entities:[...nodes.values()],edges};
}
