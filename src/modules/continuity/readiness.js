export const REQUIRED_FIELDS = Object.freeze(['context', 'institution', 'original_location', 'professional', 'trusted_person', 'instructions']);
export const FIELD_LABELS = Object.freeze({context:'Why this record matters',institution:'Institution or provider',original_location:'Location of the original',professional:'Professional contact',trusted_person:'Person who should know',instructions:'Next-step instructions',linked_people:'Linked people available',linked_records:'Linked records available',owner:'Recorded owner linked',beneficiary:'Recorded beneficiary linked',custodian:'Original custodian linked',jurisdiction:'Jurisdiction recorded',review:'Review current',renewal:'Renewal information recorded',policy_information:'Policy administrative information complete'});
export function completeness(payload) { return Object.fromEntries(REQUIRED_FIELDS.map(field=>[field,Boolean(String(payload[field==='context'?'description':field]||'').trim())])); }
// This index lives inside encrypted_metadata, never a plaintext database column.
export function continuityIndex(payload={}) {
 const details=payload.continuity_details||{},asset=details.asset||{},document=details.document||{};
 const allocations=group=>(asset[group]||[]).map(row=>row.person_id);
 const people=details.kind==='ASSET'?[...allocations('owners'),...allocations('nominees'),...allocations('beneficiaries')]:details.kind==='DOCUMENT'?['custodians','professionals','people'].flatMap(group=>document[group]||[]):[];
 const records=details.kind==='ASSET'?['documents','policies','instructions'].flatMap(group=>asset[group]||[]):details.kind==='DOCUMENT'?document.assets||[]:[];
 return {version:1,kind:details.kind||'OTHER',person_ids:[...new Set(people)],record_ids:[...new Set(records)],owner_ids:allocations('owners'),beneficiary_ids:allocations('beneficiaries'),custodian_ids:document.custodians||[],physical_original:document.physical_original||'UNKNOWN',jurisdiction_recorded:!!details.jurisdiction?.country};
}
// Date-only reminders use the user's local calendar, avoiding a day shift west of UTC.
export function reviewDate(value) {
 if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return null;
 const date = new Date(`${value}T00:00:00`);
 const [year, month, day] = value.split('-').map(Number);
 return Number.isFinite(date.getTime()) && date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? date : null;
}
export function needsReview(record,now=Date.now()) {
 const selected = reviewDate(record.next_review_date);
 if (selected) return selected.getTime() <= now;
 const reviewed=Date.parse(record.reviewed_at);
 return !Number.isFinite(reviewed)||reviewed>now||now-reviewed>=365*86400000;
}
export function recordedSections(statements, sectionNames) {
 return sectionNames.flatMap((name,index)=>statements.some(item=>!item.archived&&item.kind==='statement'&&item.section===name)?[index]:[]);
}
export function reviewSchedule(records, now=Date.now()) {
 return records.filter(record=>!record.archived).map(record=>{
  const reviewed=Date.parse(record.reviewed_at);
  const valid=Number.isFinite(reviewed)&&reviewed<=now;
  const selected = reviewDate(record.next_review_date);
  return {id:record.id,title:record.title,due:needsReview(record,now),date:selected?selected.toISOString():valid?new Date(reviewed+365*86400000).toISOString():null};
 }).sort((a,b)=>Number(b.due)-Number(a.due)||(Date.parse(a.date)||0)-(Date.parse(b.date)||0));
}
// Seven equally weighted criteria per active record: its existence plus six
// continuity fields. Archived records/statements are excluded. Not a security score.
export function assessReadiness(records,now=Date.now(),people) {
 const active=records.filter(r=>!r.archived&&r.kind!=='statement');
 const gaps=active.flatMap(record=>REQUIRED_FIELDS.filter(f=>record.completeness?.[f]!==true).map(field=>({record_id:record.id,field})));
 let possible=active.length*7;
 if(people) {
  const knownPeople=new Set(people.filter(p=>!p.archived).map(p=>p.id)),knownRecords=new Set(active.map(r=>r.id));
  const allKnown=(ids,known)=>Array.isArray(ids)&&ids.every(id=>known.has(id));
  for(const record of active){
   const index=record.continuity_index;
   const checks={review:!needsReview(record,now)};
   if(index){
    checks.linked_people=allKnown(index.person_ids,knownPeople);
    checks.linked_records=allKnown(index.record_ids,knownRecords);
    if(['ASSET','DOCUMENT','POLICY'].includes(index.kind))checks.jurisdiction=index.jurisdiction_recorded===true;
    if(index.kind==='ASSET'){checks.owner=!!index.owner_ids?.length&&allKnown(index.owner_ids,knownPeople);checks.beneficiary=!!index.beneficiary_ids?.length&&allKnown(index.beneficiary_ids,knownPeople);}
    if(index.kind==='DOCUMENT'&&index.physical_original==='YES')checks.custodian=!!index.custodian_ids?.length&&allKnown(index.custodian_ids,knownPeople);
   }
   if(record.category==='Insurance'){
    const policy=record.insurance_index||{},valid=ids=>!!ids?.length&&ids.every(id=>id==='self'||knownPeople.has(id));
    checks.owner=policy.checks?.owner===true&&(policy.owner_id==='self'||knownPeople.has(policy.owner_id));
    checks.beneficiary=policy.checks?.beneficiary===true&&!!policy.beneficiary_ids?.length&&policy.beneficiary_ids.every(id=>knownPeople.has(id));
    checks.linked_people=valid(policy.insured_ids)&&allKnown(policy.trusted_ids||[],knownPeople);
    checks.linked_records=allKnown(policy.asset_ids||[],knownRecords);
    checks.policy_information=['provider','reference','documents','contact','claim_instructions','continuity_instructions'].every(field=>policy.checks?.[field]===true);
    checks.renewal=policy.renewal_recorded===true;
   }
   possible+=Object.keys(checks).length;
   for(const [field,complete] of Object.entries(checks))if(!complete)gaps.push({record_id:record.id,field});
  }
 }
 return {percent:possible?Math.round(100*(possible-gaps.length)/possible):0,gaps,reviewDue:active.filter(r=>needsReview(r,now)).map(r=>r.id),formula:people?'v2: recorded continuity information, current linked entities and review dates; administrative completeness only':'v1: (documented record + six completed continuity fields) / seven criteria per active record'};
}
