import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
const service=vi.hoisted(()=>({sharingIdentity:vi.fn()}));
const auth=vi.hoisted(()=>({reauthenticate:vi.fn()}));
const context={service};
vi.mock('../src/features/vault/VaultContext',()=>({useVault:()=>context}));
vi.mock('../src/lib/providers',()=>({AuthProvider:auth}));
import SharingIdentity from '../src/components/people/SharingIdentity';
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('registers only after reauthentication and shows public fingerprint',async()=>{
 service.sharingIdentity.mockResolvedValueOnce(null).mockResolvedValueOnce({owner_id:'owner',fingerprint:'public-fingerprint'});
 auth.reauthenticate.mockResolvedValue({});
 render(<SharingIdentity/>);
 fireEvent.click(await screen.findByRole('button',{name:'Set up sharing identity'}));
 expect(service.sharingIdentity).toHaveBeenCalledTimes(1);
 fireEvent.change(screen.getByLabelText('Account password'),{target:{value:'private-test-password'}});
 fireEvent.submit(screen.getByRole('button',{name:'Verify & continue'}).closest('form'));
 await screen.findByText('Sharing key registered');
 expect(service.sharingIdentity).toHaveBeenLastCalledWith(true);
 expect(screen.getByLabelText('Public-key fingerprint').value).toBe('public-fingerprint');
 expect(screen.queryByLabelText('Account password')).toBeNull();
});
it('never registers when authentication fails',async()=>{
 service.sharingIdentity.mockResolvedValue(null);auth.reauthenticate.mockRejectedValue(new Error('PRIVATE_FAILURE'));
 render(<SharingIdentity/>);
 fireEvent.click(await screen.findByRole('button',{name:'Set up sharing identity'}));
 fireEvent.submit(screen.getByRole('button',{name:'Verify & continue'}).closest('form'));
 await screen.findByRole('alert');
 expect(service.sharingIdentity).toHaveBeenCalledTimes(1);
 expect(screen.queryByText('PRIVATE_FAILURE')).toBeNull();
});
it('does not register automatically when a key is already present',async()=>{
 service.sharingIdentity.mockResolvedValue({owner_id:'owner',fingerprint:'fingerprint'});
 render(<SharingIdentity/>);
 await waitFor(()=>expect(screen.getByLabelText('Account identifier').value).toBe('owner'));
 expect(service.sharingIdentity).toHaveBeenCalledTimes(1);
 expect(auth.reauthenticate).not.toHaveBeenCalled();
});
