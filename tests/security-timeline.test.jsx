import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor,act} from '@testing-library/react';
const context=vi.hoisted(()=>({value:null}));
vi.mock('../src/features/vault/VaultContext',()=>({useVault:()=>context.value}));
vi.mock('../src/components/security/SecureAction',()=>({default:({onVerified})=><button onClick={onVerified}>Complete fresh authentication</button>}));
import SecurityTimeline from '../src/components/security/SecurityTimeline';
beforeEach(()=>{const data=new Map();vi.stubGlobal('localStorage',{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),clear:()=>data.clear()});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.resetAllMocks();});
function fixture(){let lock;const service={vault:{owner_id:'owner'},session:{subscribe:fn=>{lock=fn;return()=>{};}},snapshot:vi.fn(async()=>({state:'EMPTY',events:[]})),anchor:vi.fn(v=>v),reconcilePending:vi.fn(async()=>({state:'VERIFIED',events:[]})),review:vi.fn(async(_,options)=>{const next={owner_id:'owner',sequence:1,event_hash:'HASH'};await options.beforeAppend(next);return next;})};context.value={service:{securityHistory:service}};return {service,lock:()=>lock()};}
it('requires fresh authentication before writing history',async()=>{
 const f=fixture();render(<SecurityTimeline/>);await screen.findByText('No signed history is recorded yet.');
 fireEvent.click(screen.getByRole('button',{name:'Verify & record history review'}));expect(f.service.review).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Complete fresh authentication'}));await waitFor(()=>expect(f.service.review).toHaveBeenCalledOnce());
});
it('does not overwrite a saved checkpoint with an invalid import',async()=>{
 const f=fixture(),anchor={owner_id:'owner',sequence:1,event_hash:'GOOD'};localStorage.setItem('leqvor-history-anchor:owner',JSON.stringify(anchor));
 f.service.snapshot.mockResolvedValue({state:'INVALID',events:[]});render(<SecurityTimeline/>);await screen.findByText(/History does not match/);
 fireEvent.change(screen.getByLabelText('Import your offline checkpoint'),{target:{value:JSON.stringify({...anchor,event_hash:'BAD'})}});fireEvent.click(screen.getByRole('button',{name:'Verify imported checkpoint'}));
 await screen.findByRole('alert');expect(JSON.parse(localStorage.getItem('leqvor-history-anchor:owner'))).toEqual(anchor);
});
it('discards late history and checkpoint imports after Cold Lock',async()=>{
 const f=fixture();let finish;f.service.snapshot.mockReturnValue(new Promise(resolve=>{finish=resolve;}));render(<SecurityTimeline/>);
 act(()=>f.lock());await act(async()=>finish({state:'VERIFIED',events:[{id:'late',created_at:new Date().toISOString()}]}));expect(screen.queryByText('Security history reviewed')).toBeNull();
});
it('does not persist a late successful import after leaving the dialog',async()=>{
 const f=fixture();render(<SecurityTimeline/>);await screen.findByText('No signed history is recorded yet.');let finish;f.service.snapshot.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 fireEvent.change(screen.getByLabelText('Import your offline checkpoint'),{target:{value:JSON.stringify({owner_id:'owner',sequence:1,event_hash:'HASH'})}});fireEvent.click(screen.getByRole('button',{name:'Verify imported checkpoint'}));cleanup();await act(async()=>finish({state:'VERIFIED',events:[]}));expect(localStorage.getItem('leqvor-history-anchor:owner')).toBeNull();
});
it('reconciles a retained pending checkpoint before permitting another review',async()=>{
 const f=fixture(),next={owner_id:'owner',sequence:1,event_hash:'HASH'};
 localStorage.setItem('leqvor-history-anchor:owner:pending',JSON.stringify({previous:null,next}));
 f.service.snapshot.mockResolvedValue({state:'VERIFIED',events:[]});render(<SecurityTimeline/>);
 await screen.findByText('History matches your retained checkpoint.');
 expect(f.service.reconcilePending).toHaveBeenCalledWith({previous:null,next},null);expect(localStorage.getItem('leqvor-history-anchor:owner:pending')).toBeNull();expect(JSON.parse(localStorage.getItem('leqvor-history-anchor:owner'))).toEqual(next);expect(f.service.review).not.toHaveBeenCalled();
});
it('keeps an unverified pending write and blocks additional reviews',async()=>{
 const f=fixture(),text=JSON.stringify({previous:null,next:{owner_id:'owner',sequence:1,event_hash:'HASH'}});
 localStorage.setItem('leqvor-history-anchor:owner:pending',text);f.service.reconcilePending.mockResolvedValue({state:'INVALID',events:[]});render(<SecurityTimeline/>);
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Verify & record history review'}).disabled).toBe(true);expect(localStorage.getItem('leqvor-history-anchor:owner')).toBeNull();expect(localStorage.getItem('leqvor-history-anchor:owner:pending')).toBe(text);
});
it('loads the correct checkpoint when switching accounts without remounting the outer dialog',async()=>{
 const f=fixture(),{rerender}=render(<SecurityTimeline/>);await screen.findByText('No signed history is recorded yet.');
 const g=fixture();g.service.vault.owner_id='second';const anchor={owner_id:'second',sequence:2,event_hash:'SECOND'};localStorage.setItem('leqvor-history-anchor:second',JSON.stringify(anchor));rerender(<SecurityTimeline/>);
 await waitFor(()=>expect(g.service.snapshot).toHaveBeenCalledWith(anchor));expect(f.service.snapshot).toHaveBeenCalledTimes(1);
});
it('does not promote a late pending reconciliation after Cold Lock',async()=>{
 const f=fixture(),text=JSON.stringify({previous:null,next:{owner_id:'owner',sequence:1,event_hash:'HASH'}});let finish;
 localStorage.setItem('leqvor-history-anchor:owner:pending',text);f.service.reconcilePending.mockReturnValue(new Promise(resolve=>{finish=resolve;}));render(<SecurityTimeline/>);act(()=>f.lock());await act(async()=>finish({state:'VERIFIED',events:[]}));
 expect(localStorage.getItem('leqvor-history-anchor:owner')).toBeNull();expect(localStorage.getItem('leqvor-history-anchor:owner:pending')).toBe(text);
});
