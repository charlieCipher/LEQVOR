import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,render,screen,fireEvent} from '@testing-library/react';
const service=vi.hoisted(()=>({addPerson:vi.fn()}));
vi.mock('../src/features/vault/VaultContext',()=>({useVault:()=>({service})}));
import TrustedPersonForm from '../src/components/people/TrustedPersonForm';
afterEach(()=>{cleanup();vi.resetAllMocks();});
function setup(saved=vi.fn()) {
 const view=render(<TrustedPersonForm onSaved={saved}/>);
 const name=screen.getByLabelText('Name'),role=screen.getByLabelText('Relationship or professional role');
 fireEvent.change(name,{target:{value:'  Test person  '}});
 fireEvent.change(role,{target:{value:'  Advisor  '}});
 return {view,name,role,form:name.closest('form')};
}
it('rejects blank names and roles before calling the encrypted service',()=>{
 const {name,role,form}=setup();
 fireEvent.change(name,{target:{value:'  '}});fireEvent.submit(form);
 expect(screen.getByRole('alert').textContent).toContain('name');
 expect(document.activeElement).toBe(name);
 fireEvent.change(name,{target:{value:'Test'}});fireEvent.change(role,{target:{value:'  '}});fireEvent.submit(form);
 expect(screen.getByRole('alert').textContent).toContain('relationship');
 expect(service.addPerson).not.toHaveBeenCalled();
});
it('blocks duplicate saves and suppresses callbacks after closing',async()=>{
 let finish;service.addPerson.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const saved=vi.fn(),{view,form}=setup(saved);
 fireEvent.submit(form);fireEvent.submit(form);
 expect(service.addPerson).toHaveBeenCalledTimes(1);
 view.unmount();await act(async()=>finish({id:'p'}));
 expect(saved).not.toHaveBeenCalled();
});
it('retains rejected input for retry and saves trimmed contact data without permissions',async()=>{
 service.addPerson.mockRejectedValueOnce(new Error('PRIVATE_FAILURE')).mockResolvedValueOnce({id:'p'});
 const saved=vi.fn(),{name,role,form}=setup(saved);
 fireEvent.click(screen.getByLabelText('Professional contact'));
 fireEvent.click(screen.getByLabelText('Chartered Accountant'));
 fireEvent.click(screen.getByLabelText('Executor'));
 fireEvent.submit(form);await screen.findByRole('alert');
 expect(name.value).toBe('  Test person  ');
 expect(screen.queryByText('PRIVATE_FAILURE')).toBeNull();
 await act(async()=>fireEvent.submit(form));
 expect(saved).toHaveBeenCalledWith({id:'p'});
 const sent=service.addPerson.mock.calls[1][0];
 expect(sent).toEqual({display_name:'Test person',relationship:'Advisor',professional:true,professional_details:null,roles:['Executor','Chartered Accountant'],reviewed_at:expect.any(String)});
 expect(name.value).toBe('');expect(role.value).toBe('');
});
