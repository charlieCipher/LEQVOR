import {afterEach,it,expect,vi} from 'vitest';
import { StrictMode } from 'react';
import {act,cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
const service=vi.hoisted(()=>({reveal:vi.fn(),files:vi.fn(),update:vi.fn()}));
vi.mock('../src/features/vault/VaultContext',()=>({useVault:()=>({service})}));
import V5RecordDetail from '../src/components/records/V5RecordDetail';
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
it('does not put a late reveal into a newly mounted record screen',async()=>{
 let finish;
 service.reveal.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 service.files.mockResolvedValue([]);
 const record={id:'r',revision:1,title:'Property',category:'Property'};
 const view=render(<StrictMode><V5RecordDetail record={record}/></StrictMode>);
 fireEvent.click(screen.getByRole('button',{name:'Reveal securely'}));
 view.unmount();
 render(<StrictMode><V5RecordDetail record={record}/></StrictMode>);
 await act(async()=>finish({description:'LATE_PRIVATE_CANARY'}));
 expect(screen.queryByText('LATE_PRIVATE_CANARY')).toBeNull();
 expect(screen.getByText('Sensitive information hidden')).toBeTruthy();
});
it('conceals stale content and offers explicit reload after a version conflict',async()=>{
 service.reveal.mockResolvedValue({description:'PRIVATE_CANARY'});
 service.files.mockResolvedValue([]);
 service.update.mockRejectedValue({code:'40001',message:'UNTRUSTED_SERVER_DETAIL'});
 const refresh=vi.fn();
 render(<V5RecordDetail record={{id:'r',revision:1,title:'Property',category:'Property'}} onChanged={refresh}/>);
 fireEvent.click(screen.getByRole('button',{name:'Reveal securely'}));
 await screen.findByText('PRIVATE_CANARY');
 fireEvent.click(screen.getByRole('button',{name:'Confirm still current'}));
 await screen.findByRole('button',{name:'Reload latest record'});
 expect(screen.queryByText('PRIVATE_CANARY')).toBeNull();
 expect(screen.queryByText('UNTRUSTED_SERVER_DETAIL')).toBeNull();
 expect(screen.getByRole('button',{name:'Reveal securely'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Reload latest record'}));
 await waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));
});

async function editRecord(onChanged=vi.fn()) {
 service.reveal.mockResolvedValue({description:'Original text'});
 service.files.mockResolvedValue([]);
 const view=render(<V5RecordDetail record={{id:'r',revision:1,title:'Property',category:'Property'}} onChanged={onChanged}/>);
 fireEvent.click(screen.getByRole('button',{name:'Reveal securely'}));
 await screen.findByText('Original text');
 fireEvent.click(screen.getByRole('button',{name:'Edit record'}));
 return {view,form:screen.getByRole('button',{name:'Save encrypted changes'}).closest('form')};
}
it('saves a custom review date without claiming the record was reviewed',async()=>{
 service.update.mockResolvedValue({});
 const {form}=await editRecord();
 fireEvent.change(screen.getByLabelText('Next review date (optional)'),{target:{value:'2027-02-15'}});
 fireEvent.submit(form);
 await waitFor(()=>expect(service.update).toHaveBeenCalledTimes(1));
 const metadata=service.update.mock.calls[0][1];
 expect(metadata.next_review_date).toBe('2027-02-15');
 expect(metadata).not.toHaveProperty('reviewed_at');
});
it('resets the custom date only when the user explicitly confirms a review',async()=>{
 service.reveal.mockResolvedValue({description:'Current information'});
 service.files.mockResolvedValue([]);service.update.mockResolvedValue({});
 render(<V5RecordDetail record={{id:'r',revision:1,title:'Property',category:'Property',next_review_date:'2026-10-06'}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Reveal securely'}));
 await screen.findByText('Current information');
 fireEvent.click(screen.getByRole('button',{name:'Confirm still current'}));
 await waitFor(()=>expect(service.update).toHaveBeenCalledTimes(1));
 expect(service.update.mock.calls[0][1]).toMatchObject({next_review_date:null,reviewed_at:expect.any(String)});
});
it('cancels edits without saving draft values',async()=>{
 await editRecord();
 fireEvent.change(screen.getByLabelText('Why it matters'),{target:{value:'Unsaved draft'}});
 fireEvent.click(screen.getByRole('button',{name:'Cancel editing'}));
 expect(screen.getByText('Original text')).toBeTruthy();
 expect(screen.queryByText('Unsaved draft')).toBeNull();
 expect(service.update).not.toHaveBeenCalled();
});
it('rejects whitespace-only edit titles',async()=>{
 const {form}=await editRecord();
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'   '}});
 fireEvent.submit(form);
 expect(screen.getByRole('alert').textContent).toContain('1 and 160');
 expect(service.update).not.toHaveBeenCalled();
});
it('preserves a failed edit for retry and trims a valid title',async()=>{
 service.update.mockRejectedValueOnce(new Error('PRIVATE_SERVER_DETAIL')).mockResolvedValueOnce({});
 const changed=vi.fn();const {form}=await editRecord(changed);
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'  Updated title  '}});
 fireEvent.change(screen.getByLabelText('Why it matters'),{target:{value:'Retained draft'}});
 fireEvent.submit(form);
 await screen.findByRole('alert');
 expect(screen.getByLabelText('Why it matters').value).toBe('Retained draft');
 expect(screen.queryByText('PRIVATE_SERVER_DETAIL')).toBeNull();
 fireEvent.submit(form);
 await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
 expect(service.update).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({title:'Updated title'}),expect.objectContaining({description:'Retained draft'}),null);
 expect(screen.queryByText('Retained draft')).toBeNull();
});
it('blocks duplicate edit submissions and ignores completion after leaving',async()=>{
 let finish;service.update.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const changed=vi.fn();const {view,form}=await editRecord(changed);
 fireEvent.submit(form);fireEvent.submit(form);
 expect(service.update).toHaveBeenCalledTimes(1);
 view.unmount();finish({});
 await Promise.resolve();await Promise.resolve();
 expect(changed).not.toHaveBeenCalled();
});
it('clears an editing draft at reveal timeout and ignores the late save callback',async()=>{
 vi.useFakeTimers();
 service.reveal.mockResolvedValue({description:'Private original'});service.files.mockResolvedValue([]);
 let finish;service.update.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const changed=vi.fn();
 render(<V5RecordDetail record={{id:'r',revision:1,title:'Property',category:'Property'}} onChanged={changed}/>);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Reveal securely'}));});
 fireEvent.click(screen.getByRole('button',{name:'Edit record'}));
 fireEvent.change(screen.getByLabelText('Why it matters'),{target:{value:'Private unsaved draft'}});
 fireEvent.submit(screen.getByRole('button',{name:'Save encrypted changes'}).closest('form'));
 await act(async()=>{vi.advanceTimersByTime(30000);});
 expect(screen.queryByLabelText('Why it matters')).toBeNull();
 expect(screen.getByText('Sensitive information hidden')).toBeTruthy();
 await act(async()=>finish({}));
 expect(changed).not.toHaveBeenCalled();
 expect(screen.queryByText('Private unsaved draft')).toBeNull();
});
