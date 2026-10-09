import {it,expect,vi,afterEach} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
const auth=vi.hoisted(()=>({passkeysAvailable:true,listPasskeys:vi.fn(),registerPasskey:vi.fn()}));
vi.mock('../src/lib/providers',()=>({AuthProvider:auth}));
vi.mock('../src/components/security/SecureAction',()=>({default:({onVerified})=><button onClick={onVerified}>Complete fresh authentication</button>}));
import PasskeySettings from '../src/components/security/PasskeySettings';
afterEach(()=>{cleanup();vi.resetAllMocks();auth.passkeysAvailable=true;});
it('keeps disabled pilots unavailable and does not claim device trust',()=>{
 auth.passkeysAvailable=false;render(<PasskeySettings/>);expect(screen.getByText(/not enabled here/)).toBeTruthy();expect(auth.listPasskeys).not.toHaveBeenCalled();
});
it('requires fresh authentication before invoking account enrollment',async()=>{
 auth.listPasskeys.mockResolvedValue([]);auth.registerPasskey.mockResolvedValue({id:'synthetic'});render(<PasskeySettings/>);
 fireEvent.click(screen.getByRole('button',{name:'Verify & register passkey'}));expect(auth.registerPasskey).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Complete fresh authentication'}));await waitFor(()=>expect(auth.registerPasskey).toHaveBeenCalledOnce());
 await screen.findByRole('button',{name:'Verify & register passkey'});
});
it('discards a late list response after leaving settings',async()=>{
 let finish;auth.listPasskeys.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=render(<PasskeySettings/>);view.unmount();finish([{id:'credential',created_at:'2026-10-09',friendly_name:'Device'}]);await Promise.resolve();expect(screen.queryByText('Device')).toBeNull();
});
