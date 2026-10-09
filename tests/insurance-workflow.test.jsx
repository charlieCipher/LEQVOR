import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecordWizard from '../src/app/RecordWizard';
import Insurance from '../src/app/Insurance';
import { insuranceIndex } from '../src/modules/insurance/continuity';
import { sampleRecords } from '../src/app/data';
afterEach(cleanup);
describe('Insurance record workflows',()=>{
  it('keeps sample policy links distinct from the insurance hub route',()=>{
    const policies=sampleRecords.filter(record=>record.category==='Insurance');
    expect(policies.length).toBeGreaterThan(0);
    for(const record of policies) expect(['insurance','new']).not.toContain(record.id);
  });
  it('creates separate policy roles without persisting sample secrets or granting permissions',async()=>{
    const onSaved=vi.fn();
    render(<RecordWizard demo initialCategory="Insurance" records={[{id:'home',title:'Home',category:'Property',continuity_kind:'ASSET'}]} people={[{id:'priya',display_name:'Priya'}]} onSaved={onSaved} onCancel={()=>{}}/>);
    fireEvent.change(screen.getByLabelText('Record title'),{target:{value:'Sample policy'}});
    fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));
    fireEvent.change(screen.getByLabelText('Policy owner'),{target:{value:'self'}});
    fireEvent.click(screen.getByRole('group',{name:'Insured person / people'}).querySelector('input[value="self"]'));
    fireEvent.click(screen.getByRole('group',{name:'Recorded beneficiary / beneficiaries'}).querySelector('input[value="priya"]'));
    fireEvent.click(screen.getByLabelText('Home'));
    fireEvent.change(screen.getByLabelText('Claim instructions'),{target:{value:'PRIVATE TEST INSTRUCTIONS'}});
    fireEvent.change(screen.getByLabelText('Policy / reference number'),{target:{value:'PRIVATE TEST REFERENCE'}});
    for(let i=0;i<3;i++) fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));
    fireEvent.click(screen.getByRole('button',{name:'Save sample record'}));
    await waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));
    const saved=onSaved.mock.calls[0][0];
    expect(saved.insurance_index).toMatchObject({owner_id:'self',insured_ids:['self'],beneficiary_ids:['priya'],asset_ids:['home']});
    expect(saved).not.toHaveProperty('permission');
    expect(JSON.stringify(saved)).not.toContain('PRIVATE TEST');
    expect(saved.file_count).toBe(0);
  });
  it('opens a policy record from the hub and shows missing information factually',()=>{
    const go=vi.fn(),record={id:'policy',title:'House policy',category:'Insurance',insurance_index:insuranceIndex({insurance:{asset_ids:['home']}},0)};
    render(<Insurance demo records={[record,{id:'home',title:'Family home',category:'Property',continuity_kind:'ASSET'}]} people={[]} go={go}/>);
    expect(screen.getByText('Renewal information missing')).toBeTruthy();
    expect(screen.getByText('Beneficiary not recorded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Open policy record'}));
    expect(go).toHaveBeenLastCalledWith('/app/vault/policy');
  });
});
