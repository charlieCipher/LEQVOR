import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {VaultSession} from '../src/modules/security/VaultSession';
const mocks=vi.hoisted(()=>({value:null,rewrap:vi.fn(),update:vi.fn()}));
vi.mock('../src/features/vault/VaultContext',()=>({useVault:()=>mocks.value}));
vi.mock('../src/modules/security/v5Crypto',()=>({unlockVault:vi.fn(),rewrapVaultPassword:mocks.rewrap}));
vi.mock('../src/lib/providers',()=>({DatabaseProvider:{updateVault:mocks.update}}));
vi.mock('../src/components/security/SecureAction',()=>({default:({onVerified})=><button onClick={onVerified}>Complete account verification</button>}));
import VaultControls from '../src/components/security/VaultControls';
afterEach(()=>{cleanup();mocks.value?.controller.dispose();vi.resetAllMocks();});
function fixture(){const controller=new VaultSession();controller.unlock({});mocks.value={controller,vault:{id:'vault',wrapped_vmk_password:{nonce:'original'}},setVault:vi.fn(),lock:()=>controller.lock(),purge:vi.fn()};render(<VaultControls/>);}
async function fill(){
 fireEvent.click(screen.getByRole('button',{name:'Change vault password'}));expect(screen.queryByLabelText('Current vault password')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Complete account verification'}));
 const current=await screen.findByLabelText('Current vault password');fireEvent.change(current,{target:{value:'existing secret'}});fireEvent.change(screen.getByLabelText('New vault password'),{target:{value:'new synthetic password'}});fireEvent.change(screen.getByLabelText('Confirm new vault password'),{target:{value:'new synthetic password'}});fireEvent.click(screen.getByRole('button',{name:'Verify securely'}));
}
it('requires account verification and binds the password change to the current wrapper',async()=>{
 fixture();mocks.rewrap.mockResolvedValue({wrapped_vmk_password:{nonce:'next'}});mocks.update.mockResolvedValue({id:'vault'});await fill();await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('vault',{wrapped_vmk_password:{nonce:'next'}},'original'));expect(screen.getByLabelText('Inactivity Cold Lock')).toBeTruthy();
});
it('does not upload a replacement wrapper if Cold Lock occurs during derivation',async()=>{
 fixture();let finish;mocks.rewrap.mockReturnValue(new Promise(resolve=>{finish=resolve;}));await fill();act(()=>mocks.value.controller.lock());await act(async()=>finish({wrapped_vmk_password:{nonce:'next'}}));expect(mocks.update).not.toHaveBeenCalled();expect(mocks.value.setVault).not.toHaveBeenCalled();
});
