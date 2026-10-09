import {useEffect,useRef,useState} from 'react';
import {Button} from '../ui/Primitives';
import SecureAction from '../security/SecureAction';
import {safeFailure} from '../../modules/security/safeEvents';
export default function ReviewSigningIdentity({service}){
 const [card,setCard]=useState(null),[error,setError]=useState(''),[checking,setChecking]=useState(true),[register,setRegister]=useState(false);
 const active=useRef(false);
 useEffect(()=>{let cancelled=false;active.current=true;service.signingCard().then(value=>{if(!cancelled)setCard({source:service,value});},failure=>{if(!cancelled)setError(safeFailure(failure));}).finally(()=>{if(!cancelled)setChecking(false);});return()=>{cancelled=true;active.current=false;};},[service]);
 const current=card?.source===service?card.value:null;
 return <details><summary>Verification signing identity</summary>
  <p className="field-hint">A separate signing key records your manual verification decisions. It never transfers ownership or determines legal eligibility. Compare this card and its full fingerprint independently before linking a reviewer.</p>
  {checking?<p role="status">Checking signing identity…</p>:current?<><label>Public reviewer card<textarea readOnly rows={4} value={current.card}/></label><label>Signing-key fingerprint<input readOnly value={current.fingerprint}/></label></>:register?<SecureAction title="Register verification signing key" onVerified={async()=>{const value=await service.signingCard(true);if(active.current){setCard({source:service,value});setRegister(false);setError('');}}}/>:<Button disabled={!!error} onClick={()=>setRegister(true)}>Register signing key</Button>}
  {error&&<p role="alert" className="notice">{error} Verification signing is unavailable.</p>}
 </details>;
}
