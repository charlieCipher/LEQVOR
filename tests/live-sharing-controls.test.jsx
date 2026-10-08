import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,act} from '@testing-library/react';
const auth=vi.hoisted(()=>({reauthenticate:vi.fn()}));
vi.mock('../src/lib/providers',()=>({AuthProvider:auth}));
import AccessPlanner from '../src/components/people/AccessPlanner';
import SharePermissions from '../src/components/people/SharePermissions';
afterEach(()=>{cleanup();vi.resetAllMocks();vi.useRealTimers();});
const people=[{id:'person',display_name:'Recipient',relationship:'Advisor',recipient_binding:{verified_at:'2026-10-09'}}];
const records=[{id:'record',title:'Document',category:'Legal'}];
function select(){fireEvent.change(screen.getByLabelText('Trusted person'),{target:{value:'person'}});fireEvent.click(screen.getByRole('checkbox'));}
function service(owner='owner'){
 return {vault:{owner_id:owner},session:{subscribe:()=>()=>{}},list:vi.fn().mockResolvedValue([{id:'grant',record_id:'record',owner_id:'owner',recipient_id:'recipient',record_revision:2,status:'pending',expires_at:'2099-01-01'}]),accept:vi.fn().mockResolvedValue(),revoke:vi.fn().mockResolvedValue(),reveal:vi.fn().mockResolvedValue({metadata:{title:'PRIVATE_TITLE'},payload:{instructions:'PRIVATE_INSTRUCTIONS'},revision:2})};
}
it('requires confirmed recipient, review and successful reauthentication before sending one selected record',async()=>{
 const invite=vi.fn().mockResolvedValue('grant');auth.reauthenticate.mockResolvedValue();
 render(<AccessPlanner people={people} records={records} onInvite={invite}/>);select();
 fireEvent.click(screen.getByRole('button',{name:'Review selected access'}));expect(invite).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Verify & send invitation'}));expect(invite).not.toHaveBeenCalled();
 await act(async()=>fireEvent.submit(screen.getByLabelText('Account password').closest('form')));
 expect(invite).toHaveBeenCalledWith(records[0],people[0]);expect(screen.getByRole('status').textContent).toContain('Invitation sent');
});
it('blocks unconfirmed recipients and emergency activation',()=>{
 const invite=vi.fn();
 const view=render(<AccessPlanner people={[{...people[0],recipient_binding:null}]} records={records} onInvite={invite}/>);select();expect(screen.getByRole('button',{name:'Review selected access'}).disabled).toBe(true);
 view.unmount();render(<AccessPlanner emergency people={people} records={records} onInvite={invite}/>);select();expect(screen.getByRole('button',{name:'Review sample access'}).disabled).toBe(true);expect(invite).not.toHaveBeenCalled();
});
it('does not send invitations when authentication fails and suppresses private failures',async()=>{
 auth.reauthenticate.mockRejectedValue(new Error('PRIVATE_AUTH_DETAIL'));const invite=vi.fn();
 render(<AccessPlanner people={people} records={records} onInvite={invite}/>);select();fireEvent.click(screen.getByRole('button',{name:'Review selected access'}));fireEvent.click(screen.getByRole('button',{name:'Verify & send invitation'}));
 await act(async()=>fireEvent.submit(screen.getByLabelText('Account password').closest('form')));
 expect(invite).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).not.toContain('PRIVATE_AUTH_DETAIL');
});
it('rejects multi-record submissions rather than partially creating invitations',()=>{
 const invite=vi.fn();render(<AccessPlanner people={people} records={[...records,{id:'other',title:'Other record'}]} onInvite={invite}/>);
 fireEvent.change(screen.getByLabelText('Trusted person'),{target:{value:'person'}});
 screen.getAllByRole('checkbox').forEach(control=>fireEvent.click(control));
 expect(screen.getByRole('button',{name:'Review selected access'}).disabled).toBe(true);expect(invite).not.toHaveBeenCalled();
});
it('loads metadata without decryption and requires reauthentication for owner revocation',async()=>{
 const current=service();auth.reauthenticate.mockResolvedValue();render(<SharePermissions service={current}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Revoke access'}));expect(current.revoke).not.toHaveBeenCalled();expect(current.reveal).not.toHaveBeenCalled();
 await act(async()=>fireEvent.submit(screen.getByLabelText('Account password').closest('form')));expect(current.revoke).toHaveBeenCalledWith('grant');
});
it('accepts only after verification and explicitly reveals the active saved revision, then hides on blur',async()=>{
 const current=service('recipient');auth.reauthenticate.mockResolvedValue();render(<SharePermissions service={current}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Accept invitation'}));expect(current.accept).not.toHaveBeenCalled();
 current.list.mockResolvedValue([{id:'grant',record_id:'record',owner_id:'owner',recipient_id:'recipient',record_revision:2,status:'active',expires_at:'2099-01-01'}]);
 await act(async()=>fireEvent.submit(screen.getByLabelText('Account password').closest('form')));expect(current.accept).toHaveBeenCalledWith('grant');expect(current.reveal).not.toHaveBeenCalled();
 await act(async()=>fireEvent.click(await screen.findByRole('button',{name:'Reveal securely'})));expect(screen.getByText('PRIVATE_INSTRUCTIONS')).toBeTruthy();
 act(()=>window.dispatchEvent(new Event('blur')));expect(screen.queryByText('PRIVATE_INSTRUCTIONS')).toBeNull();
});
it('disables expired invitations and removes a previous account selection when the service changes',async()=>{
 const current=service();current.list.mockResolvedValue([{id:'expired',record_id:'record',owner_id:'owner',status:'pending',expires_at:'2000-01-01'}]);
 const view=render(<SharePermissions service={current}/>);
 expect((await screen.findByRole('button',{name:'Revoke access'})).disabled).toBe(true);
 view.rerender(<SharePermissions service={service('recipient')}/>);
 expect(screen.queryByRole('button',{name:'Revoke access'})).toBeNull();
 await screen.findByRole('button',{name:'Accept invitation'});expect(current.accept).not.toHaveBeenCalled();
});
