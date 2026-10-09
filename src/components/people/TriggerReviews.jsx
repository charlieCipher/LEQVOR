import {useEffect,useRef,useState} from 'react';
import {Button} from '../ui/Primitives';
import SecureAction from '../security/SecureAction';
import {safeFailure} from '../../modules/security/safeEvents';
const EMPTY = Object.freeze([]);
export default function TriggerReviews({service,people=EMPTY,records=EMPTY}){
 const [loaded,setLoaded]=useState(null),[error,setError]=useState(''),[context,setContext]=useState(null),[action,setAction]=useState(null),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const life=useRef({generation:0,timer:null});
 const rows=loaded?.source===service?loaded:null;
 useEffect(()=>{
  const state=life.current;let active=true;
  const clear=()=>{state.generation++;clearTimeout(state.timer);setContext(null);setAction(null);setBusy(false);};
  const background=()=>{if(document.hidden)clear();};
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',background);
  const unsubscribe=service.session.subscribe(clear);
  const pins=Object.fromEntries(people.filter(p=>p.review_signing_binding?.verified_at).map(p=>[p.review_signing_binding.key_id,p.review_signing_binding.public_key]));
  Promise.all([service.reviews(Date.now(),pins),service.manifests()]).then(async([reviews,manifests])=>{
   const readiness=await Promise.all(manifests.map(async manifest=>({...manifest,readiness:await service.readiness(manifest)})));
   if(active){setLoaded({source:service,reviews,manifests:readiness});setError('');}
  },failure=>{if(active)setError(safeFailure(failure));}).catch(failure=>{if(active)setError(safeFailure(failure));});
  return()=>{active=false;clear();unsubscribe();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',background);};
 },[service,people,reload]);
 async function reveal(request){
  const generation=++life.current.generation;clearTimeout(life.current.timer);setContext(null);setBusy(true);setError('');
  try{const payload=await service.revealReview(request);if(generation===life.current.generation){setContext({source:service,request,payload});life.current.timer=setTimeout(()=>{life.current.generation++;setContext(null);setAction(null);setBusy(false);},30000);}}
  catch(failure){if(generation===life.current.generation)setError(safeFailure(failure));}
  finally{if(generation===life.current.generation)setBusy(false);}
 }
 const hide=()=>{life.current.generation++;clearTimeout(life.current.timer);setContext(null);setAction(null);setBusy(false);};
 if(action)return <SecureAction title={action.type==='authorize'?'Authorize reviewed selected invitation':action.type==='cancel'?'Cancel verification request':'Sign manual verification decision'} onVerified={async()=>{
  if(action.generation!==life.current.generation)throw new Error('Review context closed. Reveal it again.');
  if(action.type==='authorize'){
   const record=records.find(r=>r.id===action.manifest.snapshot.record.id),person=people.find(p=>p.recipient_binding?.account_id===action.manifest.snapshot.recipient?.account_id);
   if(!record||!person)throw new Error('Reviewed record or recipient unavailable.');
   await service.authorize(action.manifest,record,person);
  }else if(action.type==='cancel')await service.cancel(action.request);
  else {
   if(context?.source!==service||context.request.id!==action.request.id)throw new Error('Reveal the selected evidence context before signing.');
   await service.decide(action.request,action.outcome);
  }
  if(action.generation===life.current.generation){hide();setLoaded(null);setReload(value=>value+1);}
 }}/>;
 const revealed=context?.source===service?context:null;
 return <details open={!!revealed}><summary>Verification reviews</summary>
  <p className="field-hint">Signed administrative reviews never establish eligibility, ownership or legal authority. Completed reviews require explicit owner authorization and recipient acceptance.</p>
  {error&&<p role="alert" className="notice">{error} Verification reviews could not be loaded.</p>}
  {!rows&&!error&&<p role="status">Loading verification requests…</p>}
  {revealed?<><h3>Selected encrypted review context</h3><p className="field-hint">Review the proposed recipient, requirements, evidence and instructions. This information hides after 30 seconds or focus loss.</p><label>Revealed requirements and evidence<textarea readOnly rows={12} value={JSON.stringify(revealed.payload,null,2)}/></label><Button onClick={hide}>Hide review context</Button>
   {['APPROVED','REJECTED','NEEDS_REVIEW'].map(outcome=><Button key={outcome} onClick={()=>setAction({type:'decision',request:revealed.request,outcome,generation:life.current.generation})}>{outcome==='APPROVED'?'Approve recorded context':outcome==='REJECTED'?'Reject recorded context':'Request further review'}</Button>)}
  </>:rows?.reviews.map(request=><div className="setting-row" key={request.id}><span><strong>Review {String(request.id).slice(0,8)}</strong><small>{request.review_state} · Expires {new Date(request.expires_at).toLocaleDateString()}</small></span>{request.owner_id===service.vault.owner_id?<Button disabled={request.review_state==='UNAVAILABLE'} onClick={()=>setAction({type:'cancel',request,generation:life.current.generation})}>Cancel request</Button>:<Button disabled={busy||request.review_state!=='PENDING'} onClick={()=>reveal(request)}>Reveal evidence context</Button>}</div>)}
  {rows?.manifests.map(manifest=>{
   const record=records.find(r=>r.id===manifest.snapshot.record?.id),person=people.find(p=>p.recipient_binding?.account_id===manifest.snapshot.recipient?.account_id);
   const verifiedApprovals=new Set(rows.reviews.filter(q=>q.manifest_id===manifest.id&&q.review_state==='APPROVED'&&q.signature_verified).map(q=>q.reviewer_id)).size;
   return <div className="setting-row" key={manifest.id}><span><strong>{record?.title||'Unavailable record'} → {person?.display_name||'Unavailable recipient'}</strong><small>{manifest.readiness.state} · {verifiedApprovals}/{manifest.minimum_approvals} independently verified approvals · Selected revision {manifest.snapshot.record?.revision}</small></span><Button disabled={manifest.readiness.state!=='READY_FOR_OWNER_REVIEW'||verifiedApprovals<manifest.minimum_approvals||!record||!person} onClick={()=>setAction({type:'authorize',manifest,generation:life.current.generation})}>Authorize invitation</Button></div>;
  })}
  {rows&&!rows.reviews.length&&!rows.manifests.length&&<p className="muted">No verification reviews recorded.</p>}
 </details>;
}
