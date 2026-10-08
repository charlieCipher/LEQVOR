import {useEffect,useState} from 'react';
import {Button,Empty} from '../ui/Primitives';
import SecureAction from '../security/SecureAction';
import {safeFailure} from '../../modules/security/safeEvents';
import {useSharingController} from './useSharingController';

function fields(value,prefix='',depth=0){
 if(depth>8||value===null||value===undefined)return [];
 if(typeof value!=='object')return [[prefix,String(value)]];
 return Object.entries(value).slice(0,100).flatMap(([key,item])=>fields(item,prefix?`${prefix} / ${key}`:key,depth+1)).slice(0,200);
}

// Uses the existing permissions dialog's rows and verification controls.
// Metadata only: opening this dialog never decrypts a shared record.
export default function SharePermissions({service}){
 const disclosure=useSharingController(service);
 const [loaded,setRows]=useState(null),[error,setError]=useState(''),[selection,setSelected]=useState(null),[reload,setReload]=useState(0);
 const [now,setNow]=useState(()=>Date.now());
 const rows=loaded?.source===service?loaded.rows:null;
 const selected=selection?.source===service?selection.row:null;
 useEffect(()=>{
  let active=true;
  const timer=setInterval(()=>setNow(Date.now()),1000);
  service.list().then(value=>{if(active){setRows({source:service,rows:value});setError('');}},failure=>{if(active)setError(safeFailure(failure));});
  const unsubscribe=service.session.subscribe(()=>{active=false;setRows(null);setSelected(null);});
  return()=>{active=false;clearInterval(timer);unsubscribe();};
 },[service,reload]);
 if(selected)return <SecureAction title={selected.owner_id===service.vault.owner_id?'Revoke selected access':'Accept selected invitation'} onVerified={async()=>{
  if(selected.owner_id===service.vault.owner_id)await service.revoke(selected.id);else await service.accept(selected.id);
  setSelected(null);setRows(null);setReload(value=>value+1);
 }}/>;
 if(disclosure.revealed)return <div className="stack-form">
  <h3>{disclosure.revealed.metadata.title||'Selected record'}</h3>
  <p className="muted">Saved revision {disclosure.revealed.revision}. Linked references do not grant access to another record. Information hides after 30 seconds or when this window loses focus.</p>
  {fields(disclosure.revealed.payload).map(([label,value])=><div className="setting-row" key={label}><span>{label.replaceAll('_',' ')}</span><span>{value}</span></div>)}
  <Button onClick={disclosure.hide}>Hide information</Button>
 </div>;
 return <div className="stack-form">
  <p className="muted">Relationships never grant permissions automatically. Invitations share only their saved record revision. Revocation cannot erase copies already obtained.</p>
  {error&&<p role="alert" className="notice">{error}</p>}
  {disclosure.error&&<p role="alert" className="notice">{disclosure.error}</p>}
  {rows===null&&!error&&<p role="status">Loading selected access…</p>}
  {rows?.length===0&&<Empty title="No access plans" text="Use Share Record to invite a confirmed recipient to one selected record."/>}
  {rows?.map(row=>{
   const owner=row.owner_id===service.vault.owner_id;
   const current=['pending','active'].includes(row.status)&&Date.parse(row.expires_at)>now;
   return <div className="setting-row" key={row.id}><span><strong>Record {String(row.record_id).slice(0,8)}</strong><small>{owner?'Sent':'Received'} · View only · {current?row.status:row.status==='revoked'?'revoked':'expired'} · revision {row.record_revision}</small></span><Button disabled={!current||disclosure.busy} onClick={()=>!owner&&row.status==='active'?disclosure.reveal(row.id):setSelected({source:service,row})}>{owner?'Revoke access':row.status==='pending'?'Accept invitation':'Reveal securely'}</Button></div>;
  })}
 </div>;
}
