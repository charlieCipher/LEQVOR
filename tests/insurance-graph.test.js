import {it,expect} from 'vitest';
import {insuranceGraph} from '../src/modules/continuity/insuranceGraph';
import {decryptRecordPayload} from '../src/modules/security/v5Crypto';
import {validateRelationship} from '../src/modules/continuity/graph';
it('encrypts policy roles separately and binds each relationship to its topology',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),record={id:crypto.randomUUID(),owner_id:crypto.randomUUID(),vault_id:crypto.randomUUID()};
 const person=crypto.randomUUID(),asset=crypto.randomUUID();
 const graph=await insuranceGraph(key,record,{owner_id:'self',insured_ids:[person],beneficiary_ids:[person],trusted_ids:[person],asset_ids:[asset]});
 expect(graph.entities).toHaveLength(3);expect(graph.edges).toHaveLength(4);
 for(const edge of graph.edges){const payload=await decryptRecordPayload(key,edge);expect(payload.from_entity_id).toBe(edge.from_entity_id);expect(payload.to_entity_id).toBe(edge.to_entity_id);expect(edge.managed_record_id).toBe(record.id);validateRelationship(graph.entities.find(e=>e.id===edge.from_entity_id),graph.entities.find(e=>e.id===edge.to_entity_id),payload.relation_type);expect(edge).not.toHaveProperty('relation_type');}
 expect(new Set(graph.edges.map(e=>e.wrapped_dek.nonce)).size).toBe(4);
 await expect(insuranceGraph(key,record,{asset_ids:[record.id]})).rejects.toThrow('itself');
});
