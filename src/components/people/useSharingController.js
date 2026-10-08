import {useEffect,useRef,useState} from 'react';
import {safeFailure} from '../../modules/security/safeEvents';

// Behavior only: existing views choose their own markup, styles and controls.
// Reauthentication stays with the existing SecureAction before mutations.
export function useSharingController(service){
 const [shares,setShares]=useState(null),[revealed,setRevealed]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lifetime=useRef({generation:0,timer:null});
 useEffect(()=>{
  const state=lifetime.current;
  const clear=()=>{state.generation++;clearTimeout(state.timer);setRevealed(null);setShares(null);setBusy(false);};
  const background=()=>{if(document.hidden)clear();};
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',background);
  const unsubscribe=service.session?.subscribe(clear);
  return()=>{clear();unsubscribe?.();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',background);};
 },[service]);
 function hide(){lifetime.current.generation++;clearTimeout(lifetime.current.timer);setRevealed(null);setBusy(false);}
 async function perform(operation,publish){
  const generation=++lifetime.current.generation;
  clearTimeout(lifetime.current.timer);setRevealed(null);setBusy(true);setError('');
  try{
   const result=await operation();
   if(generation!==lifetime.current.generation)return;
   publish(result);
  }catch(error){if(generation===lifetime.current.generation)setError(safeFailure(error));}
  finally{if(generation===lifetime.current.generation)setBusy(false);}
 }
 const load=()=>perform(()=>service.list(),value=>setShares({source:service,value}));
 const reveal=id=>perform(()=>service.reveal(id),value=>{setRevealed({source:service,value});lifetime.current.timer=setTimeout(hide,30000);});
 return {shares:shares?.source===service?shares.value:null,revealed:revealed?.source===service?revealed.value:null,busy,error,load,reveal,hide};
}
