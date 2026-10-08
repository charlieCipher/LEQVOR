import {useEffect,useRef,useState} from 'react';
import {Button} from '../ui/Primitives';
import {personConnections} from '../../modules/continuity/personConnections';
import {safeFailure} from '../../modules/security/safeEvents';

export default function PersonConnections({person,records,service,onOpen}){
 const [links,setLinks]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0),timer=useRef(null);
 function hide(){generation.current++;clearTimeout(timer.current);setLinks(null);setBusy(false);}
 useEffect(()=>{
  const lifecycle=generation;
  const clear=()=>{generation.current++;clearTimeout(timer.current);setLinks(null);setBusy(false);};
  window.addEventListener('blur',clear);
  const background=()=>{if(document.hidden)clear();};
  document.addEventListener('visibilitychange',background);
  return ()=>{lifecycle.current++;clearTimeout(timer.current);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',background);};
 },[]);
 async function reveal(){
  if(busy)return;
  const current=++generation.current;setBusy(true);setError('');
  try{
   const graph=await service.graph.getGraph();
   if(generation.current!==current)return;
   setLinks(personConnections(person.id,graph,records));
   timer.current=setTimeout(hide,30000);
  }catch(error){if(generation.current===current)setError(safeFailure(error));}
  finally{if(generation.current===current)setBusy(false);}
 }
 return <section className="linked-policies" aria-label="Person connections">
  <h3>Connected records</h3>
  <p className="field-hint">Recorded relationships describe continuity information. They do not grant access or establish legal authority.</p>
  {links===null?<Button type="button" disabled={busy||!service} onClick={reveal}>{busy?'Loading connections…':'Reveal connections'}</Button>:<>
   <Button type="button" onClick={hide}>Hide connections</Button>
   {!links.length&&<p className="muted">No graph-linked records recorded for this person.</p>}
   {['ASSET','DOCUMENT','POLICY','INSTRUCTION','OTHER'].map(type=>{
    const rows=links.filter(link=>link.type===type);
    return rows.length?<section key={type}><h4>{({ASSET:'Assets',DOCUMENT:'Documents',POLICY:'Insurance',INSTRUCTION:'Instructions',OTHER:'Other records'})[type]}</h4>{rows.map(({record,relationships})=><button type="button" className="document-row" key={record.id} onClick={()=>onOpen(record.id)}><span>{record.title}<small>{relationships.join(' · ')}</small></span></button>)}</section>:null;
   })}
   <p className="field-hint">Connections hide after 30 seconds or when this window loses focus.</p>
  </>}
  {error&&<p className="notice" role="alert">{error}</p>}
 </section>;
}
