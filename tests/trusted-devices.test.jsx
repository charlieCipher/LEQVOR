import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
const context=vi.hoisted(()=>({value:null}));
vi.mock('../src/features/vault/VaultContext',()=>({useVault:()=>context.value}));
vi.mock('../src/components/security/SecureAction',()=>({default:({onVerified})=><button onClick={onVerified}>Complete fresh authentication</button>}));
import TrustedDevices from '../src/components/security/TrustedDevices';
afterEach(()=>{cleanup();vi.resetAllMocks();});
function fixture(){let lock;const row={id:'device',current:true,revoked_at:null,last_verified_at:new Date().toISOString()},service={vault:{id:'vault',owner_id:'owner'},session:{subscribe:fn=>{lock=fn;return()=>{};}},list:vi.fn(async()=>[row]),verify:vi.fn(async()=>{}),revoke:vi.fn(async()=>{})};context.value={service:{devices:service}};return {service,lock:()=>lock()};}
it('requires fresh authentication before device enrollment and revocation',async()=>{
 const f=fixture();render(<TrustedDevices/>);await screen.findByText('This browser');fireEvent.click(screen.getByRole('button',{name:'Register or verify this browser'}));expect(f.service.verify).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Complete fresh authentication'}));await waitFor(()=>expect(f.service.verify).toHaveBeenCalledOnce());await screen.findByText('This browser');fireEvent.click(screen.getByRole('button',{name:'Revoke'}));expect(f.service.revoke).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Complete fresh authentication'}));await waitFor(()=>expect(f.service.revoke).toHaveBeenCalledWith('device'));
});
it('discards a pending registry response on Cold Lock',async()=>{
 const f=fixture();let finish;f.service.list.mockReturnValue(new Promise(resolve=>{finish=resolve;}));render(<TrustedDevices/>);act(()=>f.lock());await act(async()=>finish([{id:'late',current:true,revoked_at:null,last_verified_at:new Date().toISOString()}]));expect(screen.queryByText('This browser')).toBeNull();
});
it('never enables a revoked registration or treats it as an authenticated session',async()=>{
 const f=fixture();f.service.list.mockResolvedValue([{id:'revoked',current:false,revoked_at:new Date().toISOString()}]);render(<TrustedDevices/>);await screen.findByText('Revoked');expect(screen.getByRole('button',{name:'Revoke'}).disabled).toBe(true);expect(screen.queryByText('Trusted')).toBeNull();
});
