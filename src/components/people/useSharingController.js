import {useEffect,useRef,useState} from 'react';
import {safeFailure} from '../../modules/security/safeEvents';

function saveFile(file,session){
 const url=URL.createObjectURL(new Blob([file.bytes],{type:'application/octet-stream'}));
 try{
  session.trackURL(url);
  const link=document.createElement('a');link.href=url;
  link.download=typeof file.name==='string'?file.name.replace(/[\\/\r\n]/g,'_').slice(0,255)||'attachment':'attachment';
  link.click();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}

// Behavior only: existing views choose their own markup, styles and controls.
// Reauthentication stays with the existing SecureAction before mutations.
export function useSharingController(service,save=saveFile){
 const [shares,setShares]=useState(null),[revealed,setRevealed]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lifetime=useRef({generation:0,timer:null,disclosure:null});
 useEffect(()=>{
  const state=lifetime.current;
  const clear=()=>{state.generation++;state.disclosure=null;state.downloadToken=null;clearTimeout(state.timer);setRevealed(null);setShares(null);setBusy(false);};
  const background=()=>{if(document.hidden)clear();};
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',background);
  const unsubscribe=service.session?.subscribe(clear);
  return()=>{clear();unsubscribe?.();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',background);};
 },[service]);
 function hide(){lifetime.current.generation++;lifetime.current.disclosure=null;lifetime.current.downloadToken=null;clearTimeout(lifetime.current.timer);setRevealed(null);setBusy(false);}
 async function perform(operation,publish){
  const generation=++lifetime.current.generation;
  lifetime.current.disclosure=null;
  lifetime.current.downloadToken=null;
  clearTimeout(lifetime.current.timer);setRevealed(null);setBusy(true);setError('');
  try{
   const result=await operation();
   if(generation!==lifetime.current.generation)return;
   publish(result);
  }catch(error){if(generation===lifetime.current.generation)setError(safeFailure(error));}
  finally{if(generation===lifetime.current.generation)setBusy(false);}
 }
 const load=()=>perform(()=>service.list(),value=>setShares({source:service,value}));
 const reveal=id=>perform(async()=>{
  const value=await service.reveal(id);
  const attachments=service.files?await service.files(id):[];
  return {...value,grantId:id,attachments};
 },value=>{lifetime.current.disclosure={source:service,value};setRevealed({source:service,value});lifetime.current.timer=setTimeout(hide,30000);});
 async function download(fileId){
  const state=lifetime.current,current=state.disclosure,generation=state.generation;
  if(current?.source!==service||!current.value.attachments.some(file=>file.file_id===fileId)||state.downloadToken)return;
  const token=Symbol();state.downloadToken=token;
  setBusy(true);setError('');let file;
  try{
   file=await service.download(current.value.grantId,fileId);
   if(generation!==state.generation||state.disclosure!==current)return;
   save(file,service.session);
  }catch(failure){if(generation===state.generation)setError(safeFailure(failure));}
  finally{file?.bytes?.fill(0);if(state.downloadToken===token)state.downloadToken=null;if(generation===state.generation)setBusy(false);}
 }
 return {shares:shares?.source===service?shares.value:null,revealed:revealed?.source===service?revealed.value:null,busy,error,load,reveal,hide,download};
}
