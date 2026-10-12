import {useEffect,useRef,useState} from 'react';
import {useVault} from '../../features/vault/VaultContext';
import {safeFailure} from '../../modules/security/safeEvents';
import SecureAction from './SecureAction';
import {Button} from '../ui/Primitives';
import {readHistoryCheckpoints,retainPendingHistory,confirmHistoryCheckpoint} from '../../modules/security/historyCheckpointStore';
export default function SecurityTimeline(){
 const vault=useVault(),service=vault?.service?.securityHistory;
 if(!service)return <p className="notice">Unlock your vault to verify security history.</p>;
 return <SecurityTimelineState key={`${service.vault.owner_id}:${service.vault.id}`} service={service}/>;
}
function SecurityTimelineState({service}){
 const lifecycle=useRef(null);
 const [initial]=useState(()=>{try{return readHistoryCheckpoints(service);}catch(failure){return {anchor:null,error:safeFailure(failure)};}});
 const [anchor,setAnchor]=useState(initial.anchor),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(initial.error||''),[reviewing,setReviewing]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{if(!service)return;let active=true;const token={service};lifecycle.current=token;
  (async()=>{
   const journal=readHistoryCheckpoints(service);
   if(journal.pending){
    const value=await service.reconcilePending(journal.pending,anchor);if(!active)return;
    if(value.state!=='VERIFIED'){setSnapshot({source:service,anchor,value:{state:'INVALID',events:[]}});setError('A pending history write could not be verified. Keep your offline checkpoint; do not replace it with a server-supplied head.');return;}
    confirmHistoryCheckpoint(service,journal.pending.next);setAnchor(journal.pending.next);setError('');return;
   }
   const value=await service.snapshot(anchor);if(active)setSnapshot({source:service,anchor,value});
  })().catch(failure=>{if(active){setError(safeFailure(failure));setSnapshot({source:service,anchor,value:{state:'INVALID',events:[]}});}});
  const unsubscribe=service.session.subscribe(()=>{active=false;lifecycle.current=null;setSnapshot(null);setReviewing(false);});
  return()=>{active=false;if(lifecycle.current===token)lifecycle.current=null;unsubscribe();};
 },[service,anchor,reload]);
 if(!service)return <p className="notice">Unlock your vault to verify security history.</p>;
 const visible=snapshot?.source===service&&snapshot.anchor===anchor?snapshot.value:null;
 const save=next=>{confirmHistoryCheckpoint(service,next);setError('');setAnchor(next);setReload(n=>n+1);};
 if(reviewing)return <SecureAction title="Record signed history review" onVerified={async()=>{const token=lifecycle.current,next=await service.review(anchor,{beforeAppend:next=>{if(!token||lifecycle.current!==token)throw new Error('History view closed.');retainPendingHistory(service,anchor,next);}});if(!token||lifecycle.current!==token)return;save(next);setReviewing(false);}}/>;
 return <div className="stack-form"><p>Account-signed, tamper-evident history. An independently retained checkpoint is required to detect truncation. This does not establish device trust or prove that other operations are audited.</p>
 {error&&<p role="alert" className="notice">{error}</p>}
 <p role="status">{visible?.state==='VERIFIED'?'History matches your retained checkpoint.':visible?.state==='EMPTY'?'No signed history is recorded yet.':visible?.state==='UNANCHORED'?'Import your offline checkpoint before verifying existing history.':visible?.state==='INVALID'?'History does not match your checkpoint. Do not replace it with a server-supplied head.':'Verifying history…'}</p>
 {visible?.state==='VERIFIED'&&<ol className="security-event-list">{visible.events.map(event=><li key={event.id}><strong>{{SECURITY_HISTORY_REVIEWED:'Security history reviewed',DEVICE_ENROLLED:'Browser signing key registered',DEVICE_PROOF_VERIFIED:'Browser key possession verified',DEVICE_REVOKED:'Browser registration revoked'}[event.event_type]}</strong><small>{new Date(event.created_at).toLocaleString()} · Account signature verified</small></li>)}</ol>}
 <Button disabled={!['EMPTY','VERIFIED'].includes(visible?.state)} onClick={()=>setReviewing(true)}>Verify & record history review</Button>
 {anchor?.owner_id===service.vault.owner_id&&<label>Retain this public checkpoint offline<textarea readOnly rows={4} value={JSON.stringify(anchor)}/></label>}
 <form onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,token=lifecycle.current;let verified=false;try{const text=new FormData(form).get('checkpoint');if(String(text).length>1000)throw new Error();const candidate=service.anchor(JSON.parse(text));const checked=await service.snapshot(candidate);if(!token||lifecycle.current!==token)return;if(checked.state!=='VERIFIED')throw new Error();verified=true;save(candidate);form.reset();}catch(failure){if(token&&lifecycle.current===token)setError(verified?safeFailure(failure):'Enter a valid independently retained checkpoint for this account. Your saved checkpoint has not been replaced.');}}}><label>Import your offline checkpoint<textarea name="checkpoint" maxLength={1000} rows={4} required/></label><Button>Verify imported checkpoint</Button></form></div>;
}
