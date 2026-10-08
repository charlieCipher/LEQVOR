const labels={OWNS:'Recorded owner',NOMINEE_FOR:'Recorded nominee',BENEFICIARY_OF:'Recorded beneficiary',EXECUTOR_FOR:'Recorded executor',ORIGINAL_HELD_BY:'Original custodian',ADVISED_BY:'Professional contact',SUBJECT_PERSON:'Related person',TRUSTED_FOR:'Trusted contact',RELATES_TO:'Related instruction',INSURED_PERSON:'Insured person',POLICY_OWNER:'Policy owner'};
// Consume only the graph verified and decrypted by ContinuityGraphService.
// Relationship labels never imply an active record grant or legal authority.
export function personConnections(personId,graph,records){
 const index=new Map(records.map(record=>[record.id,record]));
 const entities=new Map(graph.entities.map(entity=>[entity.id,entity]));
 const linked=new Map();
 for(const edge of graph.edges){
  if(edge.from_entity_id!==personId&&edge.to_entity_id!==personId)continue;
  const id=edge.from_entity_id===personId?edge.to_entity_id:edge.from_entity_id;
  const record=index.get(id),entity=entities.get(id);
  if(!record||!entity||entity.entity_type==='PERSON')continue;
  if(!linked.has(id))linked.set(id,{record,type:entity.entity_type,relationships:[]});
  const label=labels[edge.relation_type];
  if(label&&!linked.get(id).relationships.includes(label))linked.get(id).relationships.push(label);
 }
 return [...linked.values()];
}
