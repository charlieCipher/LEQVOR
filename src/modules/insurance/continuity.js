// Administrative completeness only: never claim eligibility or adequacy of cover.
export const CLAIM_ITEMS = Object.freeze([
  ['provider', 'Provider recorded'], ['reference', 'Policy reference recorded'],
  ['owner', 'Policy owner recorded'], ['insured', 'Insured person recorded'],
  ['beneficiary', 'Beneficiary recorded'], ['documents', 'Supporting document attached'],
  ['contact', 'Advisor / contact recorded'], ['claim_instructions', 'Claim instructions recorded'],
  ['continuity_instructions', 'Continuity instructions recorded'],
]);
const present = value => typeof value === 'string' && value.trim().length > 0;
const ids = value => [...new Set(Array.isArray(value) ? value.filter(present) : [])];
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function insuranceIndex(payload = {}, fileCount = 0) {
  const p = payload.insurance || {};
  return {
    version: 1, owner_id: present(p.owner_id) ? p.owner_id : '',
    insured_ids: ids(p.insured_ids), beneficiary_ids: ids(p.beneficiary_ids),
    asset_ids: ids(p.asset_ids), trusted_ids: ids(p.trusted_ids),
    policy_status: ['Active', 'Inactive'].includes(p.policy_status) ? p.policy_status : 'Not recorded',
    renewal_recorded: validDate(p.renewal_date), renewal_date: validDate(p.renewal_date) ? p.renewal_date : null,
    checks: {
      provider: present(payload.institution), reference: present(payload.reference),
      owner: present(p.owner_id), insured: ids(p.insured_ids).length > 0,
      beneficiary: ids(p.beneficiary_ids).length > 0, documents: fileCount > 0,
      contact: present(payload.professional), claim_instructions: present(p.claim_instructions),
      continuity_instructions: present(payload.instructions),
    },
  };
}
export function claimReadiness(record, people) {
  const index = record.insurance_index || {}, checks = { ...index.checks };
  if (people) {
    const known = new Set(people.map(p => p.id));
    checks.owner = checks.owner === true && (index.owner_id === 'self' || known.has(index.owner_id));
    checks.insured = checks.insured === true && ids(index.insured_ids).length > 0 && ids(index.insured_ids).every(id => id === 'self' || known.has(id));
    checks.beneficiary = checks.beneficiary === true && ids(index.beneficiary_ids).length > 0 && ids(index.beneficiary_ids).every(id => known.has(id));
  }
  const items = CLAIM_ITEMS.map(([key, label]) => ({ key, label, complete: checks[key] === true }));
  return { items, completed: items.filter(i => i.complete).length, total: items.length };
}
export const insurancePolicies = records => records.filter(r => r.category === 'Insurance' && !r.archived);
export function policiesForPerson(records, personId) {
  return insurancePolicies(records).flatMap(record => {
    const p = record.insurance_index || {}, roles = [];
    if (p.owner_id === personId) roles.push('Owner');
    if (ids(p.insured_ids).includes(personId)) roles.push('Insured');
    if (ids(p.beneficiary_ids).includes(personId)) roles.push('Beneficiary');
    if (ids(p.trusted_ids).includes(personId)) roles.push('Trusted contact');
    return roles.length ? [{ record, roles }] : [];
  });
}
export function policiesForAsset(records, assetId) {
  return insurancePolicies(records).filter(r => ids(r.insurance_index?.asset_ids).includes(assetId));
}
export function coverageFacts(records, assetId) {
  const linked = policiesForAsset(records, assetId);
  if (!linked.length) return ['No active policy linked'];
  const facts = ['Policy linked'];
  if (!linked.some(r => r.insurance_index?.policy_status === 'Active')) facts.push('No active policy linked');
  if (linked.some(r => !r.insurance_index?.renewal_recorded)) facts.push('Renewal information missing');
  if (linked.some(r => !ids(r.insurance_index?.beneficiary_ids).length)) facts.push('Beneficiary not recorded');
  return facts;
}
export function readInsuranceForm(form, records, people) {
  const personIds = new Set(people.filter(p=>!p.archived).map(p => p.id)), assetIds = new Set(records.filter(isInsuranceAsset).map(r => r.id));
  const selected = (field, allowed, self = false) => [...new Set(form.getAll(field).filter(id => allowed.has(id) || (self && id === 'self')))];
  const owner = form.get('policy_owner') || '';
  const date = form.get('renewal_date') || '';
  if (date && !validDate(date)) throw new Error('Enter a valid renewal date.');
  return {
    version: 1, policy_type: String(form.get('policy_type') || ''),
    policy_status: String(form.get('policy_status') || 'Not recorded'),
    owner_id: owner === 'self' || personIds.has(owner) ? owner : '',
    insured_ids: selected('policy_insured', personIds, true),
    beneficiary_ids: selected('policy_beneficiary', personIds),
    trusted_ids: selected('policy_trusted', personIds),
    asset_ids: selected('policy_asset', assetIds),
    renewal_date: date, claim_instructions: String(form.get('claim_instructions') || ''),
  };
}
export const isInsuranceAsset = record => !record.archived && (record.continuity_kind === 'ASSET' || (record.demo && ['Property','Financial','Other'].includes(record.category)));

export function renewalSchedule(records,now=Date.now()) {
  if(!Number.isFinite(now))throw new Error('Supply the review time.');
  const today=new Date(now),date=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  return insurancePolicies(records).map(record=>{
    const value=record.insurance_index?.renewal_date;
    const due=validDate(value)?new Date(`${value}T00:00:00`):null;
    return {id:record.id,title:record.title,date:value||null,state:!due?'MISSING':due<date?'OVERDUE':due.getTime()-date.getTime()<=30*86400000?'UPCOMING':'RECORDED'};
  }).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
}
