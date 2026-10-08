import {useEffect,useState} from 'react';
import {safeFailure} from '../../modules/security/safeEvents';

export default function AttachmentChoices({record,load,onChange}){
 const [rows,setRows]=useState(null),[chosen,setChosen]=useState([]),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  load(record).then(value=>{if(active)setRows(value);},failure=>{if(active)setError(safeFailure(failure));});
  return()=>{active=false;};
 },[record,load]);
 return <fieldset><legend>Selected attachments ({chosen.length})</legend>
  <p className="field-hint">Optional: select individual files. Unselected files and linked records remain private. Shared encrypted downloads currently support files up to 4 MB including encryption overhead.</p>
  {error&&<p role="alert" className="notice">{error}</p>}
  {!rows&&!error&&<p role="status">Loading attachments…</p>}
  {rows?.length===0&&<p className="muted">No attachments recorded.</p>}
  <div className="record-choice-list">{rows?.map(row=><label className="preference-check" key={row.id}><input type="checkbox" checked={chosen.includes(row.id)} disabled={!chosen.includes(row.id)&&chosen.length>=20} onChange={event=>{
   const ids=event.target.checked?[...chosen,row.id]:chosen.filter(id=>id!==row.id);
   setChosen(ids);onChange(rows.filter(file=>ids.includes(file.id)));
  }}/><span>{row.name}</span></label>)}</div>
 </fieldset>;
}
