import {useState} from 'react';
import {ASSET_GROUPS,OWNERSHIP_TYPES} from '../../modules/continuity/assetDetails';
function AllocationGroup({group,initial=[],people}){
 const [rows,setRows]=useState(()=>initial.map(r=>({...r,key:crypto.randomUUID()})));
 return <fieldset><legend>{group[0].toUpperCase()+group.slice(1)}</legend>
  {rows.map((row,index)=><div key={row.key} className="form-pair">
   <label>{group} person {index+1}<select name={`asset_${group}_person`} value={row.person_id} onChange={e=>setRows(old=>old.map(r=>r.key===row.key?{...r,person_id:e.target.value}:r))}>
    <option value="">Select a person</option>
    {row.person_id&&!people.some(p=>p.id===row.person_id)&&<option value={row.person_id}>Unavailable person — select a replacement</option>}
    {people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}
   </select></label>
   <label>{group} allocation {index+1} (%)<input name={`asset_${group}_share`} inputMode="decimal" placeholder="Unknown" defaultValue={row.allocation_bps==null?'':(row.allocation_bps/100).toFixed(2)}/></label>
   <button type="button" onClick={()=>setRows(old=>old.filter(r=>r.key!==row.key))}>Remove {group} person {index+1}</button>
  </div>)}
  <button type="button" disabled={!people.length||rows.length>=50} onClick={()=>setRows(old=>[...old,{key:crypto.randomUUID(),person_id:'',allocation_bps:null}])}>Add {group} person</button>
 </fieldset>;
}
export default function AssetPeopleFields({value={},people=[],records=[]}){
 return <><label>Ownership type<select name="ownership_type" defaultValue={value.ownership_type||'UNKNOWN'}>{OWNERSHIP_TYPES.map(type=><option key={type} value={type}>{type.toLowerCase()}</option>)}</select></label>
 {!people.length&&<p className="field-hint">Add a person in People to record an owner, nominee or beneficiary.</p>}
 {ASSET_GROUPS.map(group=><AllocationGroup key={group} group={group} initial={value[group]} people={people}/>)}
 <label>Nomination evidence or reference<textarea name="nomination_evidence" maxLength={2000} defaultValue={value.nomination_evidence||''}/></label>
 {['documents','policies','instructions'].map(group=><fieldset key={group}><legend>Linked {group}</legend>{records.map(r=><label className="checkbox-label" key={r.id}><input type="checkbox" name={`asset_${group}`} value={r.id} defaultChecked={value[group]?.includes(r.id)||false}/>{r.title}</label>)}{(value[group]||[]).filter(id=>!records.some(r=>r.id===id)).map(id=><label className="checkbox-label" key={id}><input type="checkbox" name={`asset_${group}`} value={id} defaultChecked/>Unavailable record — uncheck to remove this link</label>)}{!records.length&&<p>No other records available.</p>}</fieldset>)}
 <p className="field-hint">Leave unknown allocations blank. Each group may total up to 100%; a partial total is incomplete information. Nominees and beneficiaries are recorded separately. These entries grant no access or legal entitlement.</p></>;
}
export function AssetPeopleView({value,people=[]}){
 if(!value)return null;
 return <section><h3>Ownership and designations</h3><p>Ownership: {value.ownership_type||'UNKNOWN'}</p>
 {ASSET_GROUPS.map(group=><div key={group}><h4>{group[0].toUpperCase()+group.slice(1)}</h4>{value[group]?.length?<ul>{value[group].map(row=><li key={row.person_id}>{people.find(p=>p.id===row.person_id)?.display_name||'Unavailable person'} — {row.allocation_bps==null?'Allocation unknown':`${(row.allocation_bps/100).toFixed(2)}%`}</li>)}</ul>:<p>Not recorded</p>}</div>)}
 <p>Nomination evidence: {value.nomination_evidence||'Not recorded'}</p></section>;
}
