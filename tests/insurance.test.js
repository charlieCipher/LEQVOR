import { describe, it, expect } from 'vitest';
import { insuranceIndex, claimReadiness, policiesForPerson, policiesForAsset, coverageFacts, readInsuranceForm, validDate, renewalSchedule } from '../src/modules/insurance/continuity';
const payload = { institution:'Insurer',reference:'SECRET-POLICY-ID',professional:'Advisor',instructions:'PRIVATE CONTINUITY WORDS',insurance:{owner_id:'owner',insured_ids:['insured'],beneficiary_ids:['beneficiary'],asset_ids:['home'],trusted_ids:['advisor'],policy_status:'Active',renewal_date:'2027-02-28',claim_instructions:'PRIVATE CLAIM WORDS'} };
const policy = { id:'policy',category:'Insurance',insurance_index:insuranceIndex(payload,1) };
describe('Insurance continuity',()=>{
  it('keeps owner, insured, beneficiary, and trusted contact separate',()=>{
    for(const [id,role] of [['owner','Owner'],['insured','Insured'],['beneficiary','Beneficiary'],['advisor','Trusted contact']]) expect(policiesForPerson([policy],id)[0].roles).toEqual([role]);
    expect(policiesForAsset([policy],'home')).toEqual([policy]);
    expect(policiesForPerson([policy],'unrelated')).toEqual([]);
    expect(policy.insurance_index).not.toHaveProperty('permission');
  });
  it('indexes links and completeness without private policy values',()=>{
    const index=JSON.stringify(policy.insurance_index);
    for(const secret of ['SECRET-POLICY-ID','PRIVATE CONTINUITY WORDS','PRIVATE CLAIM WORDS']) expect(index).not.toContain(secret);
    expect(claimReadiness(policy).completed).toBe(9);
    expect(claimReadiness({})).toMatchObject({completed:0,total:9});
  });
  it('reports factual missing information without assessing cover',()=>{
    expect(coverageFacts([policy],'home')).toEqual(['Policy linked']);
    expect(coverageFacts([],'home')).toEqual(['No active policy linked']);
    const incomplete={...policy,insurance_index:insuranceIndex({insurance:{asset_ids:['home']}},0)};
    expect(coverageFacts([incomplete],'home')).toEqual(['Policy linked','No active policy linked','Renewal information missing','Beneficiary not recorded']);
    expect(policiesForAsset([{...policy,archived:true}],'home')).toEqual([]);
  });
  it('does not count a removed person as recorded beneficiary',()=>{
    const result=claimReadiness(policy,[{id:'owner'},{id:'insured'}]);
    expect(result.items.find(i=>i.key==='beneficiary').complete).toBe(false);
    expect(result.completed).toBe(8);
  });
  it('rejects invalid dates and filters unknown cross-vault references',()=>{
    expect(validDate('2027-02-30')).toBe(false);
    expect(validDate('2028-02-29')).toBe(true);
    const f=new FormData();f.set('policy_owner','other-vault-person');f.append('policy_insured','self');f.append('policy_asset','other-vault-asset');f.append('policy_asset','home');f.append('policy_beneficiary','known');f.append('policy_beneficiary','unknown');
    expect(readInsuranceForm(f,[{id:'home',category:'Property',continuity_kind:'ASSET'}],[{id:'known'}])).toMatchObject({owner_id:'',insured_ids:['self'],asset_ids:['home'],beneficiary_ids:['known']});
    f.set('renewal_date','2027-02-30');expect(()=>readInsuranceForm(f,[],[])).toThrow('valid renewal date');
  });
});
it('requires every linked person and schedules factual local-calendar renewals',()=>{
 const incomplete={...policy,insurance_index:{...policy.insurance_index,beneficiary_ids:['beneficiary','removed']}};
 expect(claimReadiness(incomplete,[{id:'owner'},{id:'insured'},{id:'beneficiary'}]).items.find(i=>i.key==='beneficiary').complete).toBe(false);
 expect(renewalSchedule([policy],new Date(2027,1,1,12).getTime())[0].state).toBe('UPCOMING');
 expect(renewalSchedule([policy],new Date(2027,2,1,12).getTime())[0].state).toBe('OVERDUE');
 const form=new FormData();form.append('policy_asset','document');form.append('policy_asset','archived');
 expect(readInsuranceForm(form,[{id:'document',continuity_kind:'DOCUMENT'},{id:'archived',continuity_kind:'ASSET',archived:true}],[]).asset_ids).toEqual([]);
});

