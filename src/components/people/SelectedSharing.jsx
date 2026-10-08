import {useEffect,useRef,useState} from 'react';
import {useVault} from '../../features/vault/VaultContext';
import SecureAction from '../security/SecureAction';
import {Button} from '../ui/Primitives';
import {safeFailure} from '../../modules/security/safeEvents';

export default function SelectedSharing({people,records}){
 const vault=useVault(),[person,setPerson]=useState(''),[record,setRecord]=useState(''),[shares,setShares]=useState(null),[error,setError]=useState(''),[action,setAction]=useState(null),[revealed,setRevealed]=useState(null),[busy,setBusy]=useState(false);
 const lifecycle=useRef({generation:0,timer:null});
 useEffect(()=>{
  const state=lifecycle.current;
  const clear=()=>{state.generation++;clearTimeout(state.timer);setRevealed(null);setBusy(false);setAction(null);};
  const background=()=>{if(document.hidden)clear();};
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',background);
  return()=>{state.generation++;clearTimeout(state.timer);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',background);};
 },[]);
 async function load(){
  const generation=++lifecycle.current.generation;setError('');setBusy(true);
  try{const result=await vault.service.sharing.list();if(generation===lifecycle.current.generation)setShares(result);}
  catch(error){if(generation===lifecycle.current.generation)setError(safeFailure(error));}
  finally{if(generation===lifecycle.current.generation)setBusy(false);}
 }
 async function execute(){
  const generation=++lifecycle.current.generation;
  if(action.type==='invite')await vault.service.sharing.invite(action.record,action.person);
  else if(action.type==='accept')await vault.service.sharing.accept(action.id);
  else await vault.service.sharing.revoke(action.id);
  if(generation!==lifecycle.current.generation)return;
  setAction(null);await load();
 }
 async function reveal(id){
  const generation=++lifecycle.current.generation;clearTimeout(lifecycle.current.timer);setRevealed(null);setError('');setBusy(true);
  try{const value=await vault.service.sharing.reveal(id);if(generation!==lifecycle.current.generation)return;setRevealed({id,...value});lifecycle.current.timer=setTimeout(()=>{lifecycle.current.generation++;setRevealed(null);},30000);}
  catch(error){if(generation===lifecycle.current.generation)setError(safeFailure(error));}
  finally{if(generation===lifecycle.current.generation)setBusy(false);}
 }
 if(!vault)return <p className="notice">Unlock your vault to manage sharing.</p>;
 const contact=people.find(p=>p.id===person),chosen=records.find(r=>r.id===record);
 return <div className="stack-form">
  <p className="notice">Shares contain one saved record revision. Attachments and linked records are not included. Invitations appear in the recipient's LEQVOR sharing panel; no email is sent. Shares expire after 30 days. Editing the source does not update a share.</p>
  <p className="field-hint">Only use an independently confirmed recipient card. Revocation stops future retrieval; it cannot erase information already copied.</p>
  {action?<><p>{action.type==='invite'?`Invite ${action.person.display_name} to view ${action.record.title}?`:action.type==='accept'?'Accept this selected-record invitation?':'Revoke this selected-record share?'}</p><SecureAction title="Confirm selected access" onVerified={execute}/><Button type="button" onClick={()=>setAction(null)}>Cancel</Button></>:<>
   <label>Verified recipient<select value={person} onChange={e=>setPerson(e.target.value)}><option value="">Choose a contact</option>{people.filter(p=>p.recipient_binding).map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
   <label>Selected record<select value={record} onChange={e=>setRecord(e.target.value)}><option value="">Choose a record</option>{records.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
   <Button type="button" disabled={!contact||!chosen||busy} onClick={()=>setAction({type:'invite',person:contact,record:chosen})}>Review invitation</Button>
   <Button type="button" disabled={busy} onClick={load}>{busy?'Loading…':'Load invitations and shares'}</Button>
   {shares?.length===0&&<p>No invitations or shares recorded.</p>}
   {shares?.map(share=><section key={share.id}><h3>{share.owner_id===vault.service.vault.owner_id?'Sent share':'Received invitation'}</h3><p>Record {share.record_id.slice(-8)} · revision {share.record_revision} · {share.status}</p><p className="field-hint">{share.owner_id===vault.service.vault.owner_id?'Recipient':'Sender'} account: {share.owner_id===vault.service.vault.owner_id?share.recipient_id:share.owner_id}</p>
    {share.owner_id===vault.service.vault.owner_id&&['pending','active'].includes(share.status)&&<Button type="button" onClick={()=>setAction({type:'revoke',id:share.id})}>Revoke share</Button>}
    {share.recipient_id===vault.service.vault.owner_id&&share.status==='pending'&&<Button type="button" onClick={()=>setAction({type:'accept',id:share.id})}>Review acceptance</Button>}
    {share.recipient_id===vault.service.vault.owner_id&&share.status==='active'&&<Button type="button" disabled={busy} onClick={()=>reveal(share.id)}>Reveal shared revision</Button>}
   </section>)}
  </>}
  {revealed&&<section aria-label="Revealed shared record"><h3>{revealed.metadata.title||'Shared record'}</h3><p>Saved revision {revealed.revision}</p>{[['Description','description'],['Institution','institution'],['Reference','reference'],['Original location','original_location'],['Professional contact','professional'],['Trusted contact','trusted_person'],['Instructions','instructions']].map(([label,field])=><div key={field}><h4>{label}</h4><p>{typeof revealed.payload[field]==='string'&&revealed.payload[field]?revealed.payload[field]:'Not recorded'}</p></div>)}<Button type="button" onClick={()=>{lifecycle.current.generation++;clearTimeout(lifecycle.current.timer);setRevealed(null);}}>Hide shared record</Button><p className="field-hint">Hidden after 30 seconds or focus loss. The owner may revoke further retrieval.</p></section>}
  {error&&<p role="alert" className="notice">{error}</p>}
 </div>;
}
