import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
const sharing=vi.hoisted(()=>({list:vi.fn(),reveal:vi.fn(),invite:vi.fn()}));
vi.mock('../src/features/vault/VaultContext',()=>({useVault:()=>({service:{vault:{owner_id:'recipient'},sharing}})}));
import SelectedSharing from '../src/components/people/SelectedSharing';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('loads invitations without decrypting and clears revealed content on blur',async()=>{
 sharing.list.mockResolvedValue([{id:'g',record_id:'record',owner_id:'owner',recipient_id:'recipient',status:'active',record_revision:1}]);
 sharing.reveal.mockResolvedValue({revision:1,metadata:{title:'PRIVATE_TITLE'},payload:{instructions:'PRIVATE_INSTRUCTIONS'}});
 render(<SelectedSharing people={[]} records={[]}/>);
 expect(sharing.list).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Load invitations and shares'}));
 await screen.findByRole('button',{name:'Reveal shared revision'});expect(sharing.reveal).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Reveal shared revision'}));await screen.findByText('PRIVATE_INSTRUCTIONS');
 fireEvent(window,new Event('blur'));expect(screen.queryByText('PRIVATE_INSTRUCTIONS')).toBeNull();
});
it('requires a verified contact and reauthentication before sending an invitation',()=>{
 const people=[{id:'p',display_name:'Recipient',recipient_binding:{account_id:'recipient'}}],records=[{id:'r',title:'Chosen record'}];
 render(<SelectedSharing people={people} records={records}/>);
 expect(screen.getByRole('button',{name:'Review invitation'}).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Verified recipient'),{target:{value:'p'}});
 fireEvent.change(screen.getByLabelText('Selected record'),{target:{value:'r'}});
 fireEvent.click(screen.getByRole('button',{name:'Review invitation'}));
 expect(screen.getByLabelText('Account password')).toBeTruthy();expect(sharing.invite).not.toHaveBeenCalled();
});
