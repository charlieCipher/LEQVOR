import {useEffect,useRef,useState} from 'react';
import {useVault} from '../../features/vault/VaultContext';
import {safeFailure} from '../../modules/security/safeEvents';
import {Button} from '../ui/Primitives';
import SecureAction from './SecureAction';
export default function TrustedDevices(){
 const vault=useVault(),service=vault?.service?.devices;
 if(!service)return <p className="notice">Unlock your vault to manage registered browsers.</p>;
 return <DeviceSettings key={`${service.vault.owner_id}:${service.vault.id}`} service={service}/>;
}
function DeviceSettings({service}){
 const lifecycle=useRef(null),[snapshot,setSnapshot]=useState(null),[action,setAction]=useState(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{const token={};lifecycle.current=token;
  service.list().then(rows=>{if(lifecycle.current===token)setSnapshot({service,rows});},failure=>{if(lifecycle.current===token)setError(safeFailure(failure));});
  const unsubscribe=service.session.subscribe(()=>{lifecycle.current=null;setSnapshot(null);setAction(null);});
  return()=>{if(lifecycle.current===token)lifecycle.current=null;unsubscribe();};
 },[service,reload]);
 if(action)return <SecureAction title={action==='verify'?'Register or verify this browser':'Revoke browser registration'} onVerified={async()=>{const token=lifecycle.current;if(!token)return;if(action==='verify')await service.verify();else await service.revoke(action);if(lifecycle.current!==token)return;setAction(null);setError('');setSnapshot(null);setReload(n=>n+1);}}/>;
 return <div className="stack-form"><p>Registration proves possession of a signing key stored in this browser profile. It does not unlock your vault, prove hardware security, or end account sessions when revoked.</p>
 {error&&<p role="alert" className="notice">{error}</p>}
 {snapshot?.service===service?snapshot.rows.map(row=><div className="setting-row" key={row.id}><span><strong>{row.current?'This browser':`Registered browser ${row.id.slice(0,8)}`}</strong><small>{row.revoked_at?'Revoked':`Last proof verified ${new Date(row.last_verified_at).toLocaleString()}`}</small></span><Button disabled={row.revoked_at!==null} onClick={()=>setAction(row.id)}>Revoke</Button></div>):<p role="status">Loading browser registrations…</p>}
 <Button onClick={()=>setAction('verify')}>Register or verify this browser</Button>
 </div>;
}
