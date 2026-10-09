import {useEffect,useRef,useState} from 'react';
import {useVault} from '../../features/vault/VaultContext';
import {safeFailure} from '../../modules/security/safeEvents';
import SecureAction from './SecureAction';
import {Button} from '../ui/Primitives';
export default function SecurityTimeline(){
 const vault=useVault(),service=vault?.service?.securityHistory;
 const lifecycle=useRef(null);
 const storageKey=service?`leqvor-history-anchor:${service.vault.owner_id}`:null;
 const [anchor,setAnchor]=useState(()=>{try{return storageKey?JSON.parse(localStorage.getItem(storageKey)||'null'):null;}catch{return null;}}),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[reviewing,setReviewing]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{if(!service)return;let active=true;const token={service};lifecycle.current=token;
  service.snapshot(anchor).then(value=>{if(active)setSnapshot({source:service,anchor,value});},failure=>{if(active)setError(safeFailure(failure));});
  const unsubscribe=service.session.subscribe(()=>{active=false;lifecycle.current=null;setSnapshot(null);setReviewing(false);});
  return()=>{active=false;if(lifecycle.current===token)lifecycle.current=null;unsubscribe();};
 },[service,anchor,reload]);
 if(!service)return <p className="notice">Unlock your vault to verify security history.</p>;
 const visible=snapshot?.source===service&&snapshot.anchor===anchor?snapshot.value:null;
 const save=next=>{service.anchor(next);try{localStorage.setItem(storageKey,JSON.stringify(next));setError('');}catch{setError('This browser cannot retain the checkpoint. Save the displayed copy offline.');}setAnchor(next);setReload(n=>n+1);};
 if(reviewing)return <SecureAction title="Record signed history review" onVerified={async()=>{const token=lifecycle.current,next=await service.review(anchor);if(!token||lifecycle.current!==token)return;save(next);setReviewing(false);}}/>;
 return <div className="stack-form"><p>Account-signed, tamper-evident history. An independently retained checkpoint is required to detect truncation. This does not establish device trust or prove that other operations are audited.</p>
 {error&&<p role="alert" className="notice">{error}</p>}
 <p role="status">{visible?.state==='VERIFIED'?'History matches your retained checkpoint.':visible?.state==='EMPTY'?'No signed history is recorded yet.':visible?.state==='UNANCHORED'?'Import your offline checkpoint before verifying existing history.':visible?.state==='INVALID'?'History does not match your checkpoint. Do not replace it with a server-supplied head.':'Verifying history…'}</p>
 {visible?.state==='VERIFIED'&&<ol className="security-event-list">{visible.events.map(event=><li key={event.id}><strong>Security history reviewed</strong><small>{new Date(event.created_at).toLocaleString()} · Account signature verified</small></li>)}</ol>}
 <Button disabled={!['EMPTY','VERIFIED'].includes(visible?.state)} onClick={()=>setReviewing(true)}>Verify & record history review</Button>
 {anchor?.owner_id===service.vault.owner_id&&<label>Retain this public checkpoint offline<textarea readOnly rows={4} value={JSON.stringify(anchor)}/></label>}
 <form onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,token=lifecycle.current;try{const text=new FormData(form).get('checkpoint');if(String(text).length>1000)throw new Error();const candidate=service.anchor(JSON.parse(text));const checked=await service.snapshot(candidate);if(!token||lifecycle.current!==token)return;if(checked.state!=='VERIFIED')throw new Error();save(candidate);form.reset();}catch{if(token&&lifecycle.current===token)setError('Enter a valid independently retained checkpoint for this account. Your saved checkpoint has not been replaced.');}}}><label>Import your offline checkpoint<textarea name="checkpoint" maxLength={1000} rows={4} required/></label><Button>Verify imported checkpoint</Button></form></div>;
}
