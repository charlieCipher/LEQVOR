import {it,expect} from 'vitest';
import {readHistoryCheckpoints,retainPendingHistory,confirmHistoryCheckpoint} from '../src/modules/security/historyCheckpointStore';
function fixture(){
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const service={vault:{owner_id:'owner'},anchor:v=>{if(v?.owner_id!=='owner')throw new Error();return v;}},next={owner_id:'owner',sequence:1,event_hash:'PUBLIC'};
 return {data,storage,service,next};
}
it('retains only public checkpoints and promotes them without erasing the old checkpoint early',()=>{
 const f=fixture();retainPendingHistory(f.service,null,f.next,f.storage);expect(readHistoryCheckpoints(f.service,f.storage)).toEqual({anchor:null,pending:{previous:null,next:f.next}});
 expect(()=>retainPendingHistory(f.service,null,f.next,f.storage)).toThrow();confirmHistoryCheckpoint(f.service,f.next,f.storage);expect(readHistoryCheckpoints(f.service,f.storage)).toEqual({anchor:f.next,pending:null});
});
it('fails closed when storage throws or silently drops writes',()=>{
 const f=fixture();for(const storage of [{...f.storage,setItem:()=>{throw new Error('QUOTA');}},{...f.storage,setItem:()=>{}}])expect(()=>retainPendingHistory(f.service,null,f.next,storage)).toThrow(/No new history write/);
});
it('preserves the pending checkpoint if confirmed storage cannot be written',()=>{
 const f=fixture();retainPendingHistory(f.service,null,f.next,f.storage);expect(()=>confirmHistoryCheckpoint(f.service,f.next,{...f.storage,setItem:()=>{}})).toThrow(/Reopen history/);expect(readHistoryCheckpoints(f.service,f.storage).pending.next).toEqual(f.next);
});
it('retains both checkpoints when clearing the journal fails after promotion',()=>{
 const f=fixture();retainPendingHistory(f.service,null,f.next,f.storage);expect(()=>confirmHistoryCheckpoint(f.service,f.next,{...f.storage,removeItem:()=>{throw new Error();}})).toThrow();
 expect(readHistoryCheckpoints(f.service,f.storage)).toEqual({anchor:f.next,pending:{previous:null,next:f.next}});
});
it('rejects corrupt, foreign and changed retained checkpoints instead of resetting history',()=>{
 const f=fixture();for(const text of ['invalid','x'.repeat(2001),JSON.stringify({owner_id:'foreign'})]){f.data.set('leqvor-history-anchor:owner',text);expect(()=>readHistoryCheckpoints(f.service,f.storage)).toThrow();}
 f.data.set('leqvor-history-anchor:owner',JSON.stringify(f.next));expect(()=>retainPendingHistory(f.service,null,f.next,f.storage)).toThrow();
});
