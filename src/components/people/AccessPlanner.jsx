import { useState } from 'react';
import { Button, Badge, Empty } from '../ui/Primitives';
import SecureAction from '../security/SecureAction';
import AttachmentChoices from './AttachmentChoices';
import TriggerPlanner from './TriggerPlanner';

export default function AccessPlanner({ demo, people, records, emergency, onSave, onInvite, onFiles, triggerService }) {
  const [person, setPerson] = useState(''), [chosen, setChosen] = useState([]);
  const [permission, setPermission] = useState('View only'), [condition, setCondition] = useState('Owner approval');
  const [review, setReview] = useState(false), [saved, setSaved] = useState(false);
  const [verify,setVerify]=useState(false);
  const [attachments,setAttachments]=useState(null);
  const recipient = people.find(p => p.id === person);
  const live=!demo&&!emergency&&typeof onInvite==='function';
  const confirmed=!!recipient?.recipient_binding?.verified_at;
  const ready=!!person&&chosen.length>0&&(demo||(live&&confirmed&&chosen.length===1));
  if(!demo&&emergency&&triggerService)return <TriggerPlanner service={triggerService} people={people} records={records}/>;
  if (!people.length || !records.length) return <Empty title="Start with people and records" text="Add a trusted person and a record before planning selected access."/>;
  if(verify&&!saved)return <SecureAction title="Send selected record invitation" onVerified={async()=>{
    if(!ready||!live)throw new Error('Selected access unavailable.');
    const files=attachments?.recordId===chosen[0]?attachments.rows:[];
    if(files.length)await onInvite(records.find(r=>r.id===chosen[0]),recipient,files);
    else await onInvite(records.find(r=>r.id===chosen[0]),recipient);
    setSaved(true);setVerify(false);
  }}/>;
  return <form className="stack-form" onSubmit={e => { e.preventDefault(); if (!ready) return; if (!review) {setAttachments(null);setReview(true);} else if(live)setVerify(true); else { onSave({ person, records: chosen, permission, condition }); setSaved(true); } }}>
    <p className="notice">{demo ? 'Sample access plan only. No invitation, record key or real permission will be sent.' : live ? `Choose one record and a person with a confirmed sharing card. View-only access starts after their acceptance and expires in 30 days. ${onFiles?'Only explicitly selected attachments are included.':'Attachments are excluded.'} Linked records remain private.` : 'Recipient verification and cryptographic grants are not connected. This view does not grant access.'}</p>
    {saved ? <div role="status"><Badge>{live?'Invitation sent':'Sample plan saved'}</Badge><p>{recipient.display_name} · {chosen.length} selected records · {permission}</p><p className="muted">{live?'The recipient must accept before accessing this saved revision.':'The plan lasts only for this preview session.'}</p></div> : review ? <><h3>Review selected access</h3><div className="setting-row"><span>Person</span><strong>{recipient.display_name}</strong></div><div className="setting-row"><span>Permission</span><strong>{permission}</strong></div><div className="setting-row"><span>Activation</span><strong>{condition}</strong></div><ul>{records.filter(r => chosen.includes(r.id)).map(r => <li key={r.id}>{r.title}</li>)}</ul>
      {live&&onFiles&&<AttachmentChoices key={chosen[0]} record={records.find(r=>r.id===chosen[0])} load={onFiles} onChange={rows=>setAttachments({recordId:chosen[0],rows})}/>}
      <p className="field-hint">Removing access later cannot erase information someone has already copied.</p><div className="form-actions"><Button type="button" onClick={() => {setAttachments(null);setReview(false);}}>Back</Button><Button variant="primary">{live?'Verify & send invitation':'Save sample plan'}</Button></div></> : <>
      <label>Trusted person<select required value={person} onChange={e => setPerson(e.target.value)}><option value="">Select a person</option>{people.map(p => <option key={p.id} value={p.id}>{p.display_name} · {p.relationship}</option>)}</select></label>
      <label>Permission<select value={permission} onChange={e => setPermission(e.target.value)}><option>View only</option>{!live&&<option>Selected access</option>}</select></label>
      <label>Activation condition<select value={condition} onChange={e => setCondition(e.target.value)}><option>Owner approval</option>{emergency && <><option>Verified incapacity</option><option>Verified death and legal authority</option></>}</select></label>
      <fieldset><legend>Selected records ({chosen.length})</legend><div className="record-choice-list">{records.map(r => <label className="preference-check" key={r.id}><input type="checkbox" checked={chosen.includes(r.id)} onChange={e => setChosen(ids => e.target.checked ? [...ids, r.id] : ids.filter(id => id !== r.id))}/><span>{r.title}<small>{r.category}</small></span></label>)}</div></fieldset>
      <Button variant="primary" disabled={!ready}>{live?'Review selected access':'Review sample access'}</Button>
    </>}
  </form>;
}
