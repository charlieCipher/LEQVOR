import { useEffect, useRef, useState } from 'react';
import { useVault } from '../../features/vault/VaultContext';
import { safeFailure } from '../../modules/security/safeEvents';
import { Button, Card } from '../ui/Primitives';
import SecureAction from '../security/SecureAction';
import ReviewSigningIdentity from './ReviewSigningIdentity';

export default function SharingIdentity() {
  const vault=useVault();
  const [identity,setIdentity]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[enrolling,setEnrolling]=useState(false);
  const active=useRef(false);
  useEffect(()=>{
    active.current=true;
    let cancelled=false;
    if (!vault) return ()=>{active.current=false;};
    vault.service.sharingIdentity().then(value=>{if(!cancelled)setIdentity(value);}).catch(e=>{if(!cancelled)setError(safeFailure(e));}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;active.current=false;};
  },[vault]);
  if (!vault) return null;
  return <Card><h2>Your sharing identity</h2>
    <p className="field-hint">A separate recipient key, protected by your vault, lets you prepare for selected record access. Registration alone grants no access.</p>
    {loading ? <p role="status">Checking your sharing key…</p> : identity ? <>
      <p role="status">Sharing key registered</p>
      <label>Account identifier<input readOnly value={identity.owner_id}/></label>
      <label>Public-key fingerprint<input readOnly value={identity.fingerprint}/></label>
      <label>Public sharing card<textarea readOnly rows={4} value={identity.card || ''}/></label>
      <p className="field-hint">Give your card to the person preparing access. Confirm your account identifier and full fingerprint with them separately, in person or on a trusted call.</p>
      <p className="field-hint">Compare the full fingerprint through a trusted channel. It is not a password or recovery phrase. Invitations require explicit selection and recipient acceptance.</p>
    </> : enrolling ? <SecureAction title="Register your sharing key" onVerified={async()=>{
      const value=await vault.service.sharingIdentity(true);
      if(active.current){setIdentity(value);setEnrolling(false);setError('');}
    }}/> : <Button disabled={!!error} onClick={()=>setEnrolling(true)}>Set up sharing identity</Button>}
    {error && <p className="notice" role="alert">{error} Sharing key registration could not be checked.</p>}
    {identity&&vault.service.triggerPlanning&&<ReviewSigningIdentity service={vault.service.triggerPlanning}/>}
  </Card>;
}
