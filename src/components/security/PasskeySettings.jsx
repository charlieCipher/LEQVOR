import {useEffect,useRef,useState} from 'react';
import {AuthProvider} from '../../lib/providers';
import {safeFailure} from '../../modules/security/safeEvents';
import {Button} from '../ui/Primitives';
import SecureAction from './SecureAction';

export default function PasskeySettings(){
 const [keys,setKeys]=useState(null),[error,setError]=useState(''),[enrolling,setEnrolling]=useState(false),[reload,setReload]=useState(0);
 const active=useRef(false);
 useEffect(()=>{active.current=true;let current=true;
  if(AuthProvider.passkeysAvailable)AuthProvider.listPasskeys().then(rows=>{if(current)setKeys(rows);},failure=>{if(current)setError(safeFailure(failure));});
  return()=>{current=false;active.current=false;};
 },[reload]);
 if(!AuthProvider.passkeysAvailable)return <p className="notice">Passkey setup is not enabled here. Account password and MFA remain available. A passkey authenticates your account; it does not decrypt your vault.</p>;
 if(enrolling)return <SecureAction title="Register account passkey" onVerified={async()=>{await AuthProvider.registerPasskey();if(active.current){setEnrolling(false);setKeys(null);setError('');setReload(n=>n+1);}}}/>;
 return <div className="stack-form"><p>Your device verifies a passkey locally. LEQVOR does not receive biometric data. Continue to unlock your vault separately after account sign-in.</p>
 {error&&<p role="alert" className="notice">{error}</p>}
 {keys===null&&!error&&<p role="status">Loading registered passkeys…</p>}
 {keys?.map(key=><div className="setting-row" key={key.id}><span><strong>{key.friendly_name||'Registered passkey'}</strong><small>Registered {new Date(key.created_at).toLocaleDateString()}</small></span></div>)}
 <Button onClick={()=>setEnrolling(true)}>Verify & register passkey</Button><p className="field-hint">Synced passkeys do not prove that this particular device is trusted. Password/MFA fallback remains available.</p></div>;
}
