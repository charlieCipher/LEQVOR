import DocumentFields from './DocumentFields';
import {useState} from 'react';
import AssetPeopleFields,{AssetPeopleView} from './AssetPeopleFields';
import {NOMINATION_STATUSES,DOCUMENT_STATUSES} from '../../modules/continuity/recordDetails';
const label=value=>value.replaceAll('_',' ').toLowerCase();
export default function ContinuityDetails({value={},people=[],records=[]}){
 const [kind,setKind]=useState(value.kind||'OTHER');
 return <fieldset><legend>Structured continuity details</legend>
  <label>Continuity type<select name="continuity_kind" value={kind} onChange={e=>setKind(e.target.value)}>{['OTHER','ASSET','DOCUMENT','POLICY','INSTRUCTION'].map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
  {kind==='ASSET'&&<label>Nomination status<select name="nomination_status" defaultValue={value.asset?.nomination_status||'UNKNOWN'}>{NOMINATION_STATUSES.map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>}
  {kind==='ASSET'&&<AssetPeopleFields value={value.asset} people={people} records={records}/>}
  {kind==='DOCUMENT'&&<>
   <DocumentFields value={value.document} people={people} records={records}/>
   <label>Document existence<select name="document_existence" defaultValue={value.document?.existence||'UNKNOWN'}><option value="UNKNOWN">Unknown</option><option value="EXISTS">Exists</option></select></label>
   <label>Physical original exists<select name="physical_original" defaultValue={value.document?.physical_original||'UNKNOWN'}><option value="UNKNOWN">Unknown</option><option value="YES">Yes</option><option value="NO">No</option></select></label>
   <label>Document execution status<select name="execution_status" defaultValue={value.document?.execution_status||'UNKNOWN'}>{DOCUMENT_STATUSES.map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
   <p className="field-hint">This records the status you report. Executed does not mean LEQVOR has verified legal validity. Record the original location in the field above.</p>
  </>}
  <div className="form-pair"><label>Country code (optional)<input name="jurisdiction_country" maxLength={2} placeholder="IN" defaultValue={value.jurisdiction?.country||''}/></label><label>State or region (optional)<input name="jurisdiction_region" maxLength={120} defaultValue={value.jurisdiction?.state_or_region||''}/></label></div>
  <label>Details last verified (optional)<input name="details_verified" type="date" defaultValue={value.last_verified_date||''}/></label>
  <p className="field-hint">These details stay encrypted. Recording a nomination or jurisdiction does not establish inheritance rights or grant access.</p>
 </fieldset>;
}
export function ContinuityDetailsView({value,people=[]}){
 if(!value)return null;
 return <div><h3>Structured continuity details</h3>{value.kind==="ASSET"&&<AssetPeopleView value={value.asset} people={people}/>}{[['Type',value.kind],['Nomination status',value.asset?.nomination_status],['Document existence',value.document?.existence],['Physical original exists',value.document?.physical_original],['Execution status',value.document?.execution_status],['Country',value.jurisdiction?.country],['State or region',value.jurisdiction?.state_or_region],['Last verified',value.last_verified_date]].filter(([,v])=>v).map(([name,v])=><div className="private-field" key={name}><h3>{name}</h3><p>{v}</p></div>)}<p className="field-hint">Recorded information only; not a determination of legal validity or entitlement.</p></div>;
}
