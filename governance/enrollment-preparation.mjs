import {randomUUID} from 'node:crypto';
import {exact,hash,encode,publicCredential,validatePolicy} from './protocol.mjs';

const slots=['A','B','C'],hex=/^[a-f0-9]{64}$/;
export const ENROLLMENT_STAGES=Object.freeze(['PREPARED','ENROLLMENT_READY','ACTIVE']);
export const READINESS_CHECKS=Object.freeze(['hardware_attestation','fresh_enrollment_evidence','revocation','physical_independence','independent_policy_pin','governance_hosting','identity_mfa_roles','separate_datastore','independent_checkpoints','provider_enforcement','build_provenance','independent_review']);
export function createEnrollmentPreparation(){return {schema:'founder-enrollment-preparation-v1',platform:'leqvor.vercel.app',preparation_id:randomUUID(),revision:1,previous_preparation_hash:null,status:'PREPARED',intended_threshold:2,intended_cooling_ms:259200000,root_authority_active:false,slots:Object.fromEntries(slots.map(slot=>[slot,{status:'NOT_PROVISIONED',credential:null,evidence_hash:null}]))};}
export function validateEnrollmentPreparation(record){
 exact(record,['schema','platform','preparation_id','revision','previous_preparation_hash','status','intended_threshold','intended_cooling_ms','root_authority_active','slots']);
 if(record.schema!=='founder-enrollment-preparation-v1'||record.platform!=='leqvor.vercel.app'||!/^\b[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(record.preparation_id)||!Number.isSafeInteger(record.revision)||record.revision<1||(record.revision===1?record.previous_preparation_hash!==null:!hex.test(record.previous_preparation_hash))||record.status!=='PREPARED'||record.intended_threshold!==2||record.intended_cooling_ms!==259200000||record.root_authority_active!==false)throw Error('Invalid inactive enrollment preparation.');
 exact(record.slots,slots);const keys=[];
 for(const slot of slots){const row=record.slots[slot];exact(row,['status','credential','evidence_hash']);
  if(row.status==='NOT_PROVISIONED'){if(row.credential!==null||row.evidence_hash!==null)throw Error('Pending slot cannot contain a credential.');}
  else {if(row.status!=='EVIDENCE_PENDING_ACCEPTANCE'||!hex.test(row.evidence_hash)||row.credential?.slot!==slot)throw Error('Evidence is not enrollment acceptance.');publicCredential(row.credential);keys.push(row.credential.key_id);}
 }
 if(new Set(keys).size!==keys.length)throw Error('A key cannot occupy multiple founder slots.');return record;
}
function validateEvidence(evidence){
 if(encode(evidence).length>65536||evidence.domain!=='leqvor-founder-device-evidence-v1'||evidence.independently_verified!==false)throw Error('Bounded unaccepted public evidence required.');
 publicCredential(evidence.credential);
 const base=['domain','credential','certificate_chain','independently_verified'];
 const canonicalBase64=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&Buffer.from(v,'base64').toString('base64')===v;
 if(evidence.credential.algorithm==='RS256'){
  exact(evidence,[...base,'attestation']);if(!canonicalBase64(evidence.attestation,65536)||!canonicalBase64(evidence.certificate_chain,65536))throw Error('Invalid public Windows evidence packet.');
 }else {
  exact(evidence,[...base,'attestation_challenge']);if(!canonicalBase64(evidence.attestation_challenge,44)||Buffer.from(evidence.attestation_challenge,'base64').length!==32||!Array.isArray(evidence.certificate_chain)||evidence.certificate_chain.length<3||evidence.certificate_chain.length>10||evidence.certificate_chain.some(c=>!canonicalBase64(c,16384)))throw Error('Invalid public Android evidence packet.');
 }
 // Format/public-key validation is NOT hardware, physical-independence or
 // attestation acceptance. Keep evidence pending even if the packet says so.
}
export function recordEnrollmentEvidence(record,evidence){
 record=structuredClone(record);evidence=structuredClone(evidence);validateEnrollmentPreparation(record);validateEvidence(evidence);
 const slot=evidence.credential.slot,current=record.slots[slot],digest=hash(evidence);
 if(current.credential){if(current.credential.key_id!==evidence.credential.key_id)throw Error('Existing preparation key cannot be replaced or reset.');if(current.evidence_hash===digest)return record;}
 if(slots.some(s=>s!==slot&&record.slots[s].credential?.key_id===evidence.credential.key_id))throw Error('Duplicate founder key rejected.');
 const predecessor=hash(record);record.slots[slot]={status:'EVIDENCE_PENDING_ACCEPTANCE',credential:evidence.credential,evidence_hash:digest};record.revision++;record.previous_preparation_hash=predecessor;
 validateEnrollmentPreparation(record);return record;
}
function result(record,blockers){return {domain:'leqvor-enrollment-preparation-assessment-v1',preparation_hash:hash(record),status:'PREPARED',blockers,root_authority_active:false,activation_allowed:false,policy_candidate:null};}
// Trusted server/offline adapters must independently authenticate acceptance
// reports and the policy pin. No caller-provided "approved" flag, default
// verifier, datastore write, bootstrap route or activation function is supplied.
export async function assessEnrollmentPreparation(record,{verifyReadiness,getIndependentPolicyPin,clock=Date.now}={}){
 record=structuredClone(record);validateEnrollmentPreparation(record);
 const missing=slots.filter(s=>record.slots[s].status==='NOT_PROVISIONED');
 if(missing.length)return result(record,[...missing.map(s=>`${s}_NOT_PROVISIONED`),'INDEPENDENT_ACCEPTANCE_REQUIRED']);
 if(typeof verifyReadiness!=='function'||typeof getIndependentPolicyPin!=='function')return result(record,['INDEPENDENT_ACCEPTANCE_ADAPTERS_REQUIRED']);
 const policy={domain:'leqvor-founder-policy-v1',platform:record.platform,threshold:2,cooling_ms:259200000,credentials:slots.map(s=>record.slots[s].credential)};validatePolicy(policy);
 const started=clock();if(!Number.isSafeInteger(started))throw Error('Invalid readiness clock.');
 const preparationHash=hash(record),policyHash=hash(policy);
 const receipt=structuredClone(await verifyReadiness({preparation_hash:preparationHash,policy_hash:policyHash,policy:structuredClone(policy),preparation:structuredClone(record)}));
 const pin=await getIndependentPolicyPin(),now=clock();
 if(!Number.isSafeInteger(now)||now<started)throw Error('Readiness clock changed.');
 exact(receipt,['domain','preparation_hash','policy_hash','verified_at','expires_at','device_bindings','checks','verifier_report_hash']);
 const issued=Date.parse(receipt.verified_at),expires=Date.parse(receipt.expires_at);
 if(receipt.domain!=='leqvor-founder-enrollment-readiness-v1'||receipt.preparation_hash!==preparationHash||receipt.policy_hash!==policyHash||pin!==policyHash||!hex.test(receipt.verifier_report_hash)||!Number.isFinite(issued)||!Number.isFinite(expires)||new Date(issued).toISOString()!==receipt.verified_at||new Date(expires).toISOString()!==receipt.expires_at||issued>now+30000||expires<=now||expires<=issued||expires-issued>300000)throw Error('Independent readiness receipt or policy pin differs.');
 exact(receipt.checks,READINESS_CHECKS);if(READINESS_CHECKS.some(c=>receipt.checks[c]!==true))throw Error('Required enrollment acceptance check is incomplete.');
 if(!Array.isArray(receipt.device_bindings)||receipt.device_bindings.length!==3)throw Error('Three independent verified physical bindings required.');
 for(const row of receipt.device_bindings){exact(row,['slot','key_id','evidence_hash','device_instance_hash']);const expected=record.slots[row.slot];if(!expected||row.key_id!==expected.credential.key_id||row.evidence_hash!==expected.evidence_hash||!hex.test(row.device_instance_hash))throw Error('Verified device binding differs.');}
 if(new Set(receipt.device_bindings.map(r=>r.slot)).size!==3||new Set(receipt.device_bindings.map(r=>r.device_instance_hash)).size!==3)throw Error('Physically separate devices required.');
 return {...result(record,[]),status:'ENROLLMENT_READY',policy_candidate:policy,readiness_receipt_hash:hash(receipt)};
}
