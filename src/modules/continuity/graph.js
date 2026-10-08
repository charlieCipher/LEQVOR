// Domain relationships describe information; none confer legal or app authority.
export const ENTITY_TYPES=Object.freeze(['PERSON','ASSET','DOCUMENT','POLICY','INSTRUCTION','OTHER']);
const relationships={
 OWNS:[['PERSON'],['ASSET']],
 NOMINEE_FOR:[['PERSON'],['ASSET']],
 BENEFICIARY_OF:[['PERSON'],['ASSET','POLICY']],
 EXECUTOR_FOR:[['PERSON'],['DOCUMENT']],
 INSURED_BY:[['ASSET'],['POLICY']],
 SUPPORTED_BY:[['ASSET','POLICY'],['DOCUMENT']],
 ORIGINAL_HELD_BY:[['DOCUMENT'],['PERSON']],
 APPLIES_TO:[['DOCUMENT'],['ASSET','POLICY']],
 TRUSTED_FOR:[['PERSON'],['ASSET','DOCUMENT','POLICY','INSTRUCTION','OTHER']],
 RELATES_TO:[['INSTRUCTION'],ENTITY_TYPES],
 ADVISED_BY:[['ASSET','POLICY','DOCUMENT'],['PERSON']],
 INSURED_PERSON:[['POLICY'],['PERSON']],
 POLICY_OWNER:[['POLICY'],['PERSON']],
};
export const RELATION_TYPES=Object.freeze(Object.keys(relationships));
export function validateRelationship(from,to,relation,allocationBps) {
 const allowed=relationships[relation];
 if(!from || !to || from.id===to.id || !allowed || !allowed[0].includes(from.entity_type) || !allowed[1].includes(to.entity_type))
  throw new Error('Invalid continuity relationship.');
 if(allocationBps!==undefined && (!['NOMINEE_FOR','BENEFICIARY_OF','OWNS'].includes(relation) || !Number.isInteger(allocationBps) || allocationBps<0 || allocationBps>10000))
  throw new Error('Allocation must be an integer between 0 and 10000 basis points.');
}
