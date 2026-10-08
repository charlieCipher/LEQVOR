import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import DocumentHistory from '../src/components/records/DocumentHistory';
it('loads ciphertext history before explicit local reveal and clears revealed content on hide',async()=>{
 const snapshot={id:'r',revision:1},service={versions:vi.fn().mockResolvedValue([{revision:1,captured_at:'2026-10-08',snapshot,files:[]}]),reveal:vi.fn().mockResolvedValue({original_location:'PRIVATE_LOCATION',continuity_details:{document:{custodians:['p']}}})};
 render(<DocumentHistory record={{id:'r'}} service={service} people={[{id:'p',display_name:'Custodian'}]} records={[]} onDownload={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Load saved revisions'}));
 await screen.findByRole('button',{name:'Reveal revision 1'});expect(service.reveal).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Reveal revision 1'}));await screen.findByText('Original location: PRIVATE_LOCATION');expect(service.reveal).toHaveBeenCalledWith(snapshot);
 fireEvent.click(screen.getByRole('button',{name:'Hide revision'}));await waitFor(()=>expect(screen.queryByText('Original location: PRIVATE_LOCATION')).toBeNull());cleanup();
});
