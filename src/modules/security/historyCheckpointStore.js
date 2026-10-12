import {AurevaError} from './safeEvents';
const unavailable=()=>new AurevaError('HISTORY_CHECKPOINT_UNAVAILABLE','This browser cannot retain the history checkpoint. No new history write was started.');
const key=service=>`leqvor-history-anchor:${service.vault.owner_id}`;
const pendingKey=service=>`${key(service)}:pending`;
function read(storage,name){
 const text=storage.getItem(name);
 if(text===null)return null;
 if(typeof text!=='string'||text.length>2000)throw unavailable();
 return JSON.parse(text);
}
export function readHistoryCheckpoints(service,storage=localStorage){
 try{
  const anchor=read(storage,key(service)),pending=read(storage,pendingKey(service));
  if(anchor!==null)service.anchor(anchor);
  if(pending){
   if(Object.keys(pending).some(k=>!['previous','next'].includes(k)))throw unavailable();
   service.anchor(pending.next);if(pending.previous!==null)service.anchor(pending.previous);
  }
  return {anchor,pending};
 }catch{throw unavailable();}
}
export function retainPendingHistory(service,anchor,next,storage=localStorage){
 try{
  const existing=readHistoryCheckpoints(service,storage);
  if(existing.pending)throw unavailable();
  service.anchor(next);if(anchor!==null)service.anchor(anchor);
  if(JSON.stringify(existing.anchor)!==JSON.stringify(anchor))throw unavailable();
  const text=JSON.stringify({previous:anchor,next});
  storage.setItem(pendingKey(service),text);
  if(storage.getItem(pendingKey(service))!==text)throw unavailable();
 }catch{throw unavailable();}
}
export function confirmHistoryCheckpoint(service,next,storage=localStorage){
 try{
  service.anchor(next);const text=JSON.stringify(next);
  storage.setItem(key(service),text);
  if(storage.getItem(key(service))!==text)throw unavailable();
  // A crash here leaves both checkpoints. Reconciliation handles that case.
  storage.removeItem(pendingKey(service));
 }catch{throw new AurevaError('HISTORY_CHECKPOINT_UNAVAILABLE','The public checkpoint could not be retained. Reopen history to reconcile the pending write; keep your offline checkpoint.');}
}
