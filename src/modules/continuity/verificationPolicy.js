const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function opaqueId(value) {
 if(typeof value!=='string'||!uuid.test(value))throw new Error('Invalid continuity reference.');
 return value;
}
function text(value,max=10000){if(typeof value!=='string'||value.length>max)throw new Error('Invalid verification text.');return value;}
function ids(values){if(!Array.isArray(values)||values.length>20||new Set(values).size!==values.length)throw new Error('Invalid reviewer list.');return values.map(opaqueId);}
export function verificationPolicy(value){
 if(!value||Object.keys(value).some(k=>!['reviewer_ids','minimum_approvals','evidence_expiry_days','required_evidence','instructions'].includes(k)))throw new Error('Invalid verification policy.');
 const reviewers=ids(value.reviewer_ids);
 if(!Number.isInteger(value.minimum_approvals)||value.minimum_approvals<1||value.minimum_approvals>reviewers.length)throw new Error('Reviewers must cover the minimum approvals.');
 if(!Number.isInteger(value.evidence_expiry_days)||value.evidence_expiry_days<1||value.evidence_expiry_days>365)throw new Error('Invalid evidence expiration.');
 if(!Array.isArray(value.required_evidence)||!value.required_evidence.length||value.required_evidence.length>20)throw new Error('Required evidence is missing.');
 return {reviewer_ids:reviewers,minimum_approvals:value.minimum_approvals,evidence_expiry_days:value.evidence_expiry_days,required_evidence:value.required_evidence.map(v=>text(v,500)),instructions:text(value.instructions||''),manual_review:true};
}
export function triggerPlan(value){
 if(!value||Object.keys(value).some(k=>!['trigger_type','authority','specified_date','instructions'].includes(k)))throw new Error('Invalid trigger plan.');
 if(!['IMMEDIATE','OWNER_APPROVAL','SPECIFIED_DATE','EMERGENCY'].includes(value.trigger_type))throw new Error('This trigger is not available.');
 if(!['DISCOVER','VIEW','DOWNLOAD','COORDINATE'].includes(value.authority))throw new Error('Unsupported continuity authority.');
 if(value.trigger_type==='SPECIFIED_DATE'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.specified_date||'')||new Date(value.specified_date).toISOString().slice(0,10)!==value.specified_date))throw new Error('Invalid specified date.');
 if(value.trigger_type!=='SPECIFIED_DATE'&&value.specified_date!==undefined)throw new Error('Date does not belong to this trigger.');
 return {...value,instructions:text(value.instructions||''),activation_enabled:false};
}
export function reviewEntry(value){
 if(!value||Object.keys(value).some(k=>!['kind','outcome','notes','observed_at'].includes(k)))throw new Error('Invalid review entry.');
 if(!['EVIDENCE_REFERENCE','OWNER_REVIEW_NOTE'].includes(value.kind))throw new Error('Unsupported review entry.');
 if(value.kind==='OWNER_REVIEW_NOTE'&&!['NEEDS_REVIEW','REJECTED','RECORDED'].includes(value.outcome))throw new Error('Invalid review outcome.');
 if(value.kind==='EVIDENCE_REFERENCE'&&value.outcome!==undefined)throw new Error('Evidence cannot approve access.');
 if(typeof value.observed_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observed_at)||!Number.isFinite(Date.parse(value.observed_at))||new Date(value.observed_at).toISOString()!==value.observed_at)throw new Error('Invalid observation time.');
 return {...value,notes:text(value.notes||''),activation_enabled:false};
}
// Administrative currency only. Evidence is never an eligibility or approval check.
export function evidenceCurrency(policy,entry,now){
 if(!Number.isFinite(now)||!Number.isInteger(policy.evidence_expiry_days)||policy.evidence_expiry_days<1||policy.evidence_expiry_days>365||entry.kind!=='EVIDENCE_REFERENCE')throw new Error('Invalid evidence review.');
 const observed=Date.parse(entry.observed_at);
 if(!Number.isFinite(observed))throw new Error('Invalid observation time.');
 if(observed>now)return 'NEEDS_REVIEW';
 return now>=observed+policy.evidence_expiry_days*86400000?'EXPIRED':'NEEDS_REVIEW';
}
