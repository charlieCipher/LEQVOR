import {useState,useId} from 'react';
import {AssetPeopleView} from './AssetPeopleFields';
import {Button} from '../ui/Primitives';
import {policiesForAsset} from '../../modules/insurance/continuity';
export default function AssetDetailTabs({record,payload,records,people,files,onDownload,onOpenRecord,onOpenPerson,busy}){
 const tabs=['Overview','Property','Documents','Insurance','People','Continuity','History'];
 const [selected,setSelected]=useState('Overview'),id=useId(),asset=payload.continuity_details.asset||{};
 const linkedIds=group=>[...new Set([...(asset[group]||[]),...(group==='policies'?policiesForAsset(records,record.id).map(r=>r.id):group==='documents'?records.filter(r=>!r.archived&&r.continuity_kind==='DOCUMENT'&&r.continuity_index?.record_ids?.includes(record.id)).map(r=>r.id):[])])];
 const links=group=>linkedIds(group).length?<ul>{linkedIds(group).map(key=><li key={key}>{records.find(r=>r.id===key&&!r.archived)?.title||'Linked record unavailable'}{records.some(r=>r.id===key&&!r.archived)&&<a href={`/app/vault/${encodeURIComponent(key)}`} onClick={event=>{if(onOpenRecord&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onOpenRecord(key);}}}> Open record</a>}</li>)}</ul>:<p>No linked {group} recorded.</p>;
 return <section><div role="tablist" aria-label="Asset details" className="form-actions">{tabs.map((tab,index)=><button key={tab} type="button" role="tab" id={`${id}-${tab}`} aria-selected={selected===tab} aria-controls={`${id}-panel`} tabIndex={selected===tab?0:-1} onClick={()=>setSelected(tab)} onKeyDown={e=>{let next;if(e.key==='ArrowRight')next=(index+1)%tabs.length;if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();setSelected(tabs[next]);e.currentTarget.parentElement.children[next].focus();}}}>{tab}</button>)}</div>
 <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${selected}`}>
 {selected==='Overview'&&<><h3>{record.title}</h3><p>{payload.description||'Description not recorded'}</p><p>Institution: {payload.institution||'Not recorded'}</p><p>Nomination: {asset.nomination_status||'UNKNOWN'}</p></>}
 {selected==='Property'&&<><h3>Property and ownership context</h3><p>Category: {record.category}</p><p>Reference: {payload.reference||'Not recorded'}</p><p>Original location: {payload.original_location||'Not recorded'}</p><p>Jurisdiction: {[payload.continuity_details.jurisdiction?.country,payload.continuity_details.jurisdiction?.state_or_region].filter(Boolean).join(' / ')||'Not recorded'}</p></>}
 {selected==='Documents'&&<><h3>Supporting documents</h3>{links('documents')}<h3>Encrypted evidence attachments</h3>{files.length?files.map((f,i)=><Button key={f.id} disabled={busy} onClick={()=>onDownload(f)}>Download evidence {i+1}</Button>):<p>No evidence uploaded. Use Edit record to attach evidence.</p>}</>}
 {selected==='Insurance'&&<><h3>Recorded insurance links</h3>{links('policies')}<p className="field-hint">A linked policy does not establish coverage or claim eligibility.</p></>}
 {selected==='People'&&<AssetPeopleView value={asset} people={people} onOpenPerson={onOpenPerson}/>}
 {selected==='Continuity'&&<><h3>Instructions</h3><p>{payload.instructions||'Not recorded'}</p>{links('instructions')}<p>Professional contact: {payload.professional||'Not recorded'}</p><p>Last verified: {payload.continuity_details.last_verified_date||'Not recorded'}</p><p>Next review: {record.next_review_date||'Annual review'}</p><p>People links record intent; they do not grant access.</p></>}
 {selected==='History'&&<><h3>Current saved revision</h3><p>Revision {record.revision}</p><p>Updated: {record.updated_at||'Not available'}</p><p className="field-hint">This is the current record revision. Signed historical versions are not available in this view.</p></>}
 </div></section>;
}
