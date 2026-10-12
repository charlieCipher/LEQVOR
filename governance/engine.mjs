import {randomUUID,randomBytes} from 'node:crypto';
import {validatePolicy,validateRequest,verifyApproval,hash,exact} from './protocol.mjs';
// This engine issues root authorizations. It does not transfer infrastructure,
// grant customer access, or imply that providers enforce its freeze flag.
export function initialGovernance(policy){validatePolicy(policy);return {policy:structuredClone(policy),version:1,frozen:false,requests:{},audit:[]};}
export function checkpoint(state){return {policy_hash:hash(state.policy),state_hash:hash({policy:state.policy,version:state.version,frozen:state.frozen,requests:state.requests}),version:state.version,sequence:state.audit.length,event_hash:state.audit.at(-1)?.event_hash??null};}
function anchor(state,expected){exact(expected,['policy_hash','state_hash','version','sequence','event_hash']);if(hash(checkpoint(state))!==hash(expected))throw new Error('Independent governance checkpoint mismatch.');}
function verifyRecordedApprovals(entry,policy){
 if(!Array.isArray(entry.approvals)||entry.approvals.length>3||new Set(entry.approvals.map(a=>a.slot)).size!==entry.approvals.length||new Set(entry.approvals.map(a=>a.key_id)).size!==entry.approvals.length||entry.approvals.some(a=>!verifyApproval(entry.request,a,policy)))throw new Error('Stored founder approvals failed verification.');
}
function append(state,type,details,now){const event={domain:'leqvor-governance-audit-v1',id:randomUUID(),sequence:state.audit.length+1,previous_hash:state.audit.at(-1)?.event_hash??null,created_at:new Date(now).toISOString(),event_type:type,details};state.audit.push({...event,event_hash:hash(event)});}
export function verifyAudit(events,expected){
 try{
  if(!Array.isArray(events)||events.length!==expected.sequence)return false;let previous=null;
  for(const [index,row] of events.entries()){exact(row,['domain','id','sequence','previous_hash','created_at','event_type','details','event_hash']);const {event_hash,...content}=row;if(row.domain!=='leqvor-governance-audit-v1'||row.sequence!==index+1||row.previous_hash!==previous||hash(content)!==event_hash)return false;previous=event_hash;}
  return previous===expected.event_hash;
 }catch{return false;}
}
export class GovernanceEngine{
 constructor(store,{clock=Date.now,policyPin}={}){if(typeof policyPin!=='function')throw new Error('An independent root policy pin provider is required.');this.store=store;this.clock=clock;this.policyPin=policyPin;}
 async mutate(expected,operation){const pin=await this.policyPin();return this.store.transaction(async state=>{validatePolicy(state.policy);if(hash(state.policy)!==pin)throw new Error('Independent root policy pin mismatch.');anchor(state,expected);if(!verifyAudit(state.audit,expected))throw new Error('Governance history invalid.');const result=await operation(state,this.clock());return {result,checkpoint:checkpoint(state)};});}
 snapshot(expected){return this.mutate(expected,state=>structuredClone(state));}
 request({action,target,proposal_id=null},expected){return this.mutate(expected,(state,now)=>{
  if(state.audit.length>=10000||Object.keys(state.requests).length>=1000)throw new Error('Governance capacity requires reviewed archival.');
  if(state.frozen&&!['GOVERNANCE_UNFREEZE','GOVERNANCE_FREEZE','CANCEL_GOVERNANCE_REQUEST'].includes(action))throw new Error('Governance is frozen.');
  let proposal=null;
  if(proposal_id){proposal=state.requests[proposal_id];if(!proposal||proposal.status!=='COOLING'||!Number.isSafeInteger(proposal.cooling_until)||proposal.cooling_until<Date.parse(proposal.request.created_at)+state.policy.cooling_ms||now<proposal.cooling_until||proposal.request.governance_version!==state.version||proposal.request.policy_hash!==hash(state.policy)||proposal.request.action!==action||proposal.request.target!==target)throw new Error('Proposal is not ready for confirmation.');verifyRecordedApprovals(proposal,state.policy);if(proposal.approvals.length<state.policy.threshold)throw new Error('Proposal quorum is missing.');}
  const request={domain:'leqvor-founder-request-v1',platform:state.policy.platform,action,target,request_id:randomUUID(),nonce:randomBytes(32).toString('hex'),created_at:new Date(now).toISOString(),expires_at:new Date(now+600000).toISOString(),governance_version:state.version,policy_hash:hash(state.policy),phase:proposal?'CONFIRM':'PROPOSE',proposal_hash:proposal?hash(proposal.request):null};
  validateRequest(request,state.policy,state.version,now);
  if(['GOVERNANCE_FREEZE','CANCEL_GOVERNANCE_REQUEST'].includes(action)&&proposal)throw new Error('Protective actions cannot use confirmation.');
  if(action==='CANCEL_GOVERNANCE_REQUEST'&&!Object.values(state.requests).some(r=>hash(r.request)===target&&['PENDING','COOLING'].includes(r.status)))throw new Error('Cancellation target not pending.');
  if(proposal&&Object.values(state.requests).some(r=>r.proposal_id===proposal_id&&r.status==='PENDING'&&Date.parse(r.request.expires_at)>now))throw new Error('An active confirmation already exists.');
  state.requests[request.request_id]={request,approvals:[],status:'PENDING',proposal_id,cooling_until:null};append(state,'REQUEST_CREATED',{request},now);return structuredClone(request);
 });}
 approve(requestId,approval,expected){return this.mutate(expected,(state,now)=>{
  const entry=state.requests[requestId];if(!entry||entry.status!=='PENDING')throw new Error('Request is not pending.');
  const request=entry.request;validateRequest(request,state.policy,state.version,now);
  verifyRecordedApprovals(entry,state.policy);
  if(state.frozen&&!['GOVERNANCE_UNFREEZE','GOVERNANCE_FREEZE','CANCEL_GOVERNANCE_REQUEST'].includes(request.action))throw new Error('Governance is frozen.');
  if(!verifyApproval(request,approval,state.policy)||entry.approvals.some(a=>a.slot===approval.slot||a.key_id===approval.key_id))throw new Error('Invalid or duplicate founder approval.');
  let proposal;
  if(request.phase==='CONFIRM'){
   proposal=state.requests[entry.proposal_id];if(!proposal||proposal.status!=='COOLING'||!Number.isSafeInteger(proposal.cooling_until)||proposal.cooling_until<Date.parse(proposal.request.created_at)+state.policy.cooling_ms||now<proposal.cooling_until||hash(proposal.request)!==request.proposal_hash||proposal.request.action!==request.action||proposal.request.target!==request.target||proposal.request.governance_version!==state.version||proposal.request.policy_hash!==hash(state.policy))throw new Error('Confirmation is no longer authorized.');verifyRecordedApprovals(proposal,state.policy);if(proposal.approvals.length<state.policy.threshold)throw new Error('Proposal quorum is missing.');
  }
  entry.approvals.push(structuredClone(approval));append(state,'APPROVAL_RECORDED',{request_id:requestId,request_hash:hash(request),approval},now);
  if(entry.approvals.length>=(['GOVERNANCE_FREEZE','CANCEL_GOVERNANCE_REQUEST'].includes(request.action)?1:state.policy.threshold)){
   if(request.action==='GOVERNANCE_FREEZE'){
    state.frozen=true;state.version++;entry.status='FROZEN';append(state,'GOVERNANCE_FROZEN',{request_id:requestId},now);
   }else if(request.action==='CANCEL_GOVERNANCE_REQUEST'){
    const target=Object.values(state.requests).find(r=>hash(r.request)===request.target&&['PENDING','COOLING'].includes(r.status));if(!target)throw new Error('Cancellation target changed.');target.status='CANCELLED';entry.status='CONSUMED';append(state,'REQUEST_CANCELLED',{request_id:target.request.request_id,cancellation_id:requestId},now);
   }else if(request.phase==='PROPOSE'){
    entry.status='COOLING';entry.cooling_until=now+state.policy.cooling_ms;append(state,'COOLING_STARTED',{request_id:requestId,cooling_until:entry.cooling_until},now);
   }else{
    // Never pretend a provider ownership transfer or deployment occurred.
    proposal.status='CONSUMED';entry.status='AUTHORIZED';state.version++;
    if(request.action==='GOVERNANCE_UNFREEZE')state.frozen=false;
    append(state,'ROOT_ACTION_AUTHORIZED',{request_id:requestId,proposal_id:entry.proposal_id,action:request.action,target:request.target},now);
   }
  }
  return {request_id:requestId,status:entry.status,cooling_until:entry.cooling_until};
 });}
}
