import {verifyExecutionAuthorization} from './execution-permit.mjs';
import {exact,hash} from './protocol.mjs';

function receiptMatches(receipt,intent,now){
 exact(receipt,['domain','idempotency_key','action','target_hash','operation_id','outcome','observed_at','evidence_hash']);
 const observed=Date.parse(receipt.observed_at);
 if(receipt.domain!=='leqvor-root-provider-receipt-v1'||receipt.idempotency_key!==intent.idempotency_key||receipt.action!==intent.action||receipt.target_hash!==intent.target_hash||typeof receipt.operation_id!=='string'||!receipt.operation_id||receipt.operation_id.length>256||!['APPLIED','NOT_APPLIED'].includes(receipt.outcome)||!/^[a-f0-9]{64}$/.test(receipt.evidence_hash)||!Number.isFinite(observed)||new Date(observed).toISOString()!==receipt.observed_at||observed>now+30000||observed<Date.parse(intent.expires_at)-630000)throw new Error('Provider receipt binding invalid.');
 return receipt;
}
// No default provider, environment credentials, public HTTP route or automatic
// retry. Production adapters MUST independently fence the actual side effect;
// a preflight check here cannot make two different systems atomic.
export class RootExecutionCoordinator{
 constructor({journal,getLiveAuthority,adapters,clock=Date.now,callTimeoutMs=30000}){
  if(typeof journal?.reserve!=='function'||typeof getLiveAuthority!=='function'||!(adapters instanceof Map))throw new Error('Explicit protected execution adapters required.');
  if(!Number.isSafeInteger(callTimeoutMs)||callTimeoutMs<10||callTimeoutMs>60000)throw new Error('Bounded provider timeout required.');
  this.journal=journal;this.getLiveAuthority=getLiveAuthority;this.adapters=new Map(adapters);this.clock=clock;this.callTimeoutMs=callTimeoutMs;
 }
 async bounded(operation){const controller=new AbortController();let timer;try{return await Promise.race([operation(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Provider outcome unknown.'));},this.callTimeoutMs);})]);}finally{clearTimeout(timer);}}
 adapter(action){const a=this.adapters.get(action);if(a?.enforcement!=='independent-live-root-fence-v1'||typeof a.execute!=='function'||typeof a.lookupReceipt!=='function'||typeof a.verifyReceipt!=='function')throw new Error('Reviewed independently fenced provider adapter unavailable.');return a;}
 async verifiedReceipt(adapter,intent,target,receipt){
  const copy=structuredClone(receipt);receiptMatches(copy,intent,this.clock());
  Object.freeze(copy);if(await this.bounded(signal=>adapter.verifyReceipt({intent,target:structuredClone(target),receipt:copy,signal}))!==true)throw new Error('Provider receipt provenance unverified.');return copy;
 }
 async run(request_id,target){
  target=structuredClone(target);
  const live=await this.getLiveAuthority(),intent=verifyExecutionAuthorization({...live,request_id,target,now:this.clock()}),adapter=this.adapter(intent.action);
  const claim=await this.journal.reserve(intent,target);
  if(!claim.claimed){if(['APPLIED','NOT_APPLIED'].includes(claim.status))await this.verifiedReceipt(adapter,intent,target,claim.receipt);return claim;} // Never retry an uncertain prior attempt.
  try{
   const latest=verifyExecutionAuthorization({...await this.getLiveAuthority(),request_id,target,now:this.clock()});
   if(hash(latest)!==hash(intent))throw new Error('Live execution fence changed.');
  }catch{return this.journal.record(intent.idempotency_key,'NOT_DISPATCHED');}
  let receipt;
  try{receipt=await this.bounded(signal=>adapter.execute({intent,target:structuredClone(target),signal}));receipt=await this.verifiedReceipt(adapter,intent,target,receipt);}
  catch{return this.journal.record(intent.idempotency_key,'OUTCOME_UNKNOWN');}
  return this.journal.record(intent.idempotency_key,receipt.outcome,receipt);
 }
 async reconcile(key){
  const current=await this.journal.read(key);if(!current)throw new Error('Execution reservation missing.');
  const {intent,target}=current.reservation,adapter=this.adapter(intent.action);let receipt;
  if(['APPLIED','NOT_APPLIED'].includes(current.status)){await this.verifiedReceipt(adapter,intent,target,current.receipt);return current;}
  if(current.status==='NOT_DISPATCHED')return current;
  // Observation only, even if the original challenge expired or a freeze was
  // activated. Never call execute while reconciling an ambiguous prior attempt.
  try{receipt=await this.bounded(signal=>adapter.lookupReceipt({intent,target:structuredClone(target),signal}));receipt=await this.verifiedReceipt(adapter,intent,target,receipt);}
  catch{return this.journal.record(key,'OUTCOME_UNKNOWN');}
  return this.journal.record(key,receipt.outcome,receipt);
 }
}
