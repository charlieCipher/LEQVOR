import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
const service=vi.hoisted(()=>({addPerson:vi.fn()}));
vi.mock('../src/features/vault/VaultContext',()=>({useVault:()=>({service})}));
import TrustedPersonForm from '../src/components/people/TrustedPersonForm';
afterEach(()=>{cleanup();vi.resetAllMocks();});
function fill(){
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Test Person'}});
 fireEvent.change(screen.getByLabelText('Relationship or professional role'),{target:{value:'Advisor'}});
 fireEvent.change(screen.getByLabelText('Recipient public sharing card'),{target:{value:'public-card'}});
 fireEvent.change(screen.getByLabelText('Independently confirmed fingerprint'),{target:{value:'A'.repeat(43)}});
}
it('requires independent confirmation before submitting a recipient binding',async()=>{
 render(<TrustedPersonForm onSaved={vi.fn()}/>);fill();
 fireEvent.submit(screen.getByRole('button',{name:'Save trusted person'}).closest('form'));
 expect((await screen.findByRole('alert')).textContent).toContain('separate trusted channel');
 expect(service.addPerson).not.toHaveBeenCalled();
});
it('passes the separately confirmed fingerprint to encryption and handles validation failure',async()=>{
 service.addPerson.mockRejectedValue(new Error('PRIVATE_ERROR'));
 render(<TrustedPersonForm onSaved={vi.fn()}/>);fill();
 fireEvent.click(screen.getByLabelText("I independently confirmed this person's account identifier and fingerprint."));
 fireEvent.submit(screen.getByRole('button',{name:'Save trusted person'}).closest('form'));
 await waitFor(()=>expect(service.addPerson).toHaveBeenCalledWith(expect.objectContaining({display_name:'Test Person'}),{card:'public-card',fingerprint:'A'.repeat(43)}));
 await screen.findByRole('alert');
 expect(screen.queryByText('PRIVATE_ERROR')).toBeNull();
});
