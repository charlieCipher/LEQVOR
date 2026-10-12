import {verifySnapshot} from './audit.mjs';
import {exact,hash,ROOT_ACTIONS,validateRequest,verifyApproval} from './protocol.mjs';

function verifiedQuorum(entry,policy,state){
 if(!Array.isArray(entry.approvals)||entry.approvals.length<2||entry.approvals.length>3||new Set(entry.approvals.map(a=>a.slot)).size!==entry.approvals.length||new Set(entry.approvals.map(a=>a.key_id)).size!==entry.approvals.length)throw new Error('Distinct root quorum required.');
 for(const approval of entry.approvals){
  if(!verifyApproval(entry.request,approval,policy))throw new Error('Root signature invalid.');
  const records=state.audit.filter(e=>e.event_type==='APPROVAL_RECORDED'&&e.details.request_id===entry.request.request_id&&e.details.request_hash===hash(entry.request)&&hash(e.details.approval)===hash(approval));
  if(records.length!==1)throw new Error('Approval receipt missing or duplicated.');
  const signedAt=Date.parse(records[0].created_at);
  if(!Number.isSafeInteger(signedAt)||signedAt<Date.parse(entry.request.created_at)-30000||signedAt>=Date.parse(entry.request.expires_at))throw new Error('Approval was not timely.');
 }
}
// Invoke immediately inside an independently protected executor against live,
// authoritative state. A returned JSON object is not itself a signed permit.
// Provider idempotency, reconciliation and receipt persistence are mandatory
// integrations; this verifier never performs a remote side effect.
export function verifyExecutionAuthorization({state,checkpoint,policy,request_id,target,now}){
 verifySnapshot(state,checkpoint,policy);
 if(!Number.isSafeInteger(now)||state.frozen)throw new Error('Execution blocked by clock or governance freeze.');
 const entry=state.requests[request_id];if(!entry)throw new Error('Root authorization missing.');
 exact(entry,['request','approvals','status','proposal_id','cooling_until']);
 const request=entry.request;
 if(entry.status!=='AUTHORIZED'||request.phase!=='CONFIRM'||request.governance_version+1!==state.version||!ROOT_ACTIONS.includes(request.action)||['GOVERNANCE_FREEZE','GOVERNANCE_UNFREEZE','CANCEL_GOVERNANCE_REQUEST'].includes(request.action)||hash(target)!==request.target)throw new Error('Action, target, version or reservation differs.');
 validateRequest(request,policy,request.governance_version,now);verifiedQuorum(entry,policy,state);
 const proposal=state.requests[entry.proposal_id];if(!proposal)throw new Error('Root proposal missing.');
 exact(proposal,['request','approvals','status','proposal_id','cooling_until']);
 if(proposal.status!=='CONSUMED'||proposal.request.phase!=='PROPOSE'||proposal.proposal_id!==null||hash(proposal.request)!==request.proposal_hash||proposal.request.action!==request.action||proposal.request.target!==request.target||proposal.request.governance_version!==request.governance_version)throw new Error('Proposal binding invalid.');
 validateRequest(proposal.request,policy,request.governance_version,Date.parse(proposal.request.created_at));verifiedQuorum(proposal,policy,state);
 const cooling=state.audit.filter(e=>e.event_type==='COOLING_STARTED'&&e.details.request_id===proposal.request.request_id);
 if(cooling.length!==1||!Number.isSafeInteger(proposal.cooling_until)||cooling[0].details.cooling_until!==proposal.cooling_until||Date.parse(cooling[0].created_at)+policy.cooling_ms!==proposal.cooling_until||Date.parse(request.created_at)<proposal.cooling_until)throw new Error('Cooling evidence invalid.');
 const authorized=state.audit.filter(e=>e.event_type==='ROOT_ACTION_AUTHORIZED'&&e.details.request_id===request_id&&e.details.proposal_id===entry.proposal_id&&e.details.action===request.action&&e.details.target===request.target);
 if(authorized.length!==1||Date.parse(authorized[0].created_at)<Date.parse(request.created_at)-30000||Date.parse(authorized[0].created_at)>=Date.parse(request.expires_at)||!Number.isSafeInteger(Date.parse(authorized[0].created_at)))throw new Error('Authorization receipt invalid.');
 return Object.freeze({domain:'leqvor-root-execution-intent-v1',request_id,action:request.action,target_hash:request.target,policy_hash:request.policy_hash,governance_version:state.version,expires_at:request.expires_at,idempotency_key:hash({domain:'leqvor-root-provider-operation-v1',request})});
}
