import {useEffect,useRef,useState} from 'react';
import {Button} from '../ui/Primitives';
import SecureAction from '../security/SecureAction';

// Functional controls inside the existing Emergency Access dialog; no layout or
// styling system changes. Only explicit owner authorization is implemented.
export default function TriggerPlanner({service,people,records}){
 const [plan,setPlan]=useState(null),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const active=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const verified=people.filter(p=>p.recipient_binding?.verified_at),reviewers=verified.filter(p=>p.review_signing_binding?.verified_at);
 if(plan&&!saved)return <SecureAction title="Send encrypted verification context" onVerified={async()=>{
  const selectedReviewers=reviewers.filter(p=>plan.reviewers.includes(p.id)),evidence=records.filter(r=>plan.evidence.includes(r.id)),record=records.find(r=>r.id===plan.record),recipient=verified.find(p=>p.id===plan.recipient);
  if(!record||!recipient||selectedReviewers.length!==plan.reviewers.length||evidence.length!==plan.evidence.length)throw new Error('Selected context changed. Reopen this form.');
  const grants=await service.db.listShares();
  for(const person of selectedReviewers)if(!grants.some(g=>g.record_id===record.id&&g.recipient_id===person.recipient_binding.account_id&&g.record_revision===record.revision&&g.status==='active'&&Date.parse(g.expires_at)>Date.now()))throw new Error('First share this saved record with each reviewer and have them accept.');
  const policy=await service.savePolicy({reviewer_ids:plan.reviewers,minimum_approvals:plan.minimum,evidence_expiry_days:plan.days,required_evidence:plan.requirements,instructions:plan.instructions},selectedReviewers);
  const rule=await service.saveRule(policy,record,{trigger_type:'OWNER_APPROVAL',authority:'VIEW',instructions:plan.instructions});
  const manifest=await service.createManifest(rule,selectedReviewers,grants,evidence.map(record=>({record,observed_at:plan.observed_at})),recipient);
  for(const person of selectedReviewers){
   const grant=grants.find(g=>g.record_id===record.id&&g.recipient_id===person.recipient_binding.account_id&&g.record_revision===record.revision&&g.status==='active');
   const request=await service.requestReview(rule,person,grant,manifest);
   await service.deliverReview(request,manifest,rule,policy,person,evidence);
  }
  if(active.current){setSaved(true);setPlan(null);}
 }}/>;
 if(saved)return <p role="status">Encrypted review requests sent. Reviewers use Review Permissions to reveal the selected context and sign a decision. Complete approvals still require your explicit authorization; the recipient must then accept.</p>;
 return <form className="stack-form" onSubmit={event=>{
  event.preventDefault();const form=new FormData(event.currentTarget),reviewerIds=form.getAll('reviewer'),evidenceIds=form.getAll('evidence'),minimum=Number(form.get('minimum')),requirements=String(form.get('requirements')||'').split('\n').map(s=>s.trim()).filter(Boolean),days=Number(form.get('days'));
  if(!reviewerIds.length||reviewerIds.length>20||!evidenceIds.length||evidenceIds.length>20||minimum<1||minimum>reviewerIds.length||requirements.length!==evidenceIds.length||requirements.some(s=>s.length>500)||!Number.isInteger(days)||days<1||days>365){setError('Choose reviewers and evidence, a valid threshold and one requirement line per selected evidence record.');return;}
  setError('');setPlan({record:form.get('record'),recipient:form.get('recipient'),reviewers:reviewerIds,evidence:evidenceIds,minimum,days,requirements,instructions:String(form.get('instructions')||''),observed_at:new Date().toISOString()});
 }}>
  <p className="notice">Prepare a manual verification review for one selected record and recipient. No automatic release, death/incapacity determination, ownership transfer or claim authority is created. Reviewers must already have accepted a share of this saved record.</p>
  <label>Record to review<select name="record" required><option value="">Select a record</option>{records.filter(r=>!r.archived).map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
  <label>Proposed recipient<select name="recipient" required><option value="">Select a verified recipient</option>{verified.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
  <fieldset><legend>Independently verified reviewers</legend>{reviewers.map(p=><label className="checkbox-label" key={p.id}><input type="checkbox" name="reviewer" value={p.id}/>{p.display_name}</label>)}{!reviewers.length&&<p className="field-hint">Register and independently confirm reviewer signing cards through People first.</p>}</fieldset>
  <div className="form-pair"><label>Minimum approvals<input name="minimum" type="number" min={1} max={20} defaultValue={1} required/></label><label>Evidence expires after (days)<input name="days" type="number" min={1} max={365} defaultValue={30} required/></label></div>
  <fieldset><legend>Selected evidence records</legend>{records.filter(r=>!r.archived).map(r=><label className="checkbox-label" key={r.id}><input type="checkbox" name="evidence" value={r.id}/>{r.title}</label>)}</fieldset>
  <label>Required evidence (one line per selected record, in the order shown)<textarea name="requirements" rows={4} maxLength={10000} required/></label>
  <label>Review instructions<textarea name="instructions" rows={4} maxLength={10000}/></label>
  <label className="checkbox-label"><input type="checkbox" required/>I authorize encrypted copies of the selected evidence content and instructions to be delivered to these reviewers. Attachments and other linked records are excluded.</label>
  {error&&<p role="alert" className="notice">{error}</p>}
  <Button variant="primary" disabled={!reviewers.length||!verified.length||!records.length}>Verify & send for review</Button>
 </form>;
}
