import {encryptRecord,decryptRecordPayload} from '../security/v5Crypto';
import {ENTITY_TYPES,validateRelationship} from './graph';

export class ContinuityGraphService {
 constructor(session,vault,db){this.session=session;this.vault=vault;this.db=db;}
 assertOwner(row){
  if(!row?.id || row.owner_id!==this.vault.owner_id || row.vault_id!==this.vault.id)throw new Error('Graph item does not belong to this vault.');
 }
 register(source,type){
  this.assertOwner(source);
  if(!ENTITY_TYPES.includes(type))throw new Error('Invalid entity type.');
  return this.session.run(async(_key,assertActive)=>{
   assertActive();
   const row=await this.db.registerGraphEntity({id:source.id,owner_id:this.vault.owner_id,vault_id:this.vault.id,entity_type:type,record_id:type==='PERSON'?null:source.id,person_id:type==='PERSON'?source.id:null});
   assertActive();this.assertOwner(row);return row;
  });
 }
 getGraph(){
  return this.session.run(async(key,assertActive)=>{
   const [entities,rows]=await Promise.all([this.db.graphEntities(),this.db.graphEdges()]);
   assertActive();
   const index=new Map();
   for(const entity of entities){this.assertOwner(entity);index.set(entity.id,entity);}
   const edges=await Promise.all(rows.map(async row=>{
    this.assertOwner(row);
    const payload=await decryptRecordPayload(key,row);
    // Bind topology inside authenticated ciphertext as well as foreign keys.
    if(payload.from_entity_id!==row.from_entity_id || payload.to_entity_id!==row.to_entity_id)throw new Error('Graph integrity check failed.');
    validateRelationship(index.get(row.from_entity_id),index.get(row.to_entity_id),payload.relation_type,payload.allocation_bps);
    return {id:row.id,...payload};
   }));
   assertActive();return {entities,edges};
  });
 }
 link(from,to,{relation_type,allocation_bps,notes=''}){
  this.assertOwner(from);this.assertOwner(to);
  validateRelationship(from,to,relation_type,allocation_bps);
  if(typeof notes!=='string' || notes.length>10000)throw new Error('Invalid relationship notes.');
  return this.session.run(async(key,assertActive)=>{
   const payload={from_entity_id:from.id,to_entity_id:to.id,relation_type,notes,...(allocation_bps===undefined?{}:{allocation_bps})};
   const encrypted=await encryptRecord(key,{owner_id:this.vault.owner_id,vault_id:this.vault.id,metadata:{},payload});
   assertActive();
   const row=await this.db.saveGraphEdge({...encrypted,from_entity_id:from.id,to_entity_id:to.id});
   assertActive();this.assertOwner(row);return {id:row.id,...payload};
  });
 }
}
