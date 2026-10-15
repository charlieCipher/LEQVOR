import {hash,exact} from './protocol.mjs';

function keyCheck(key){if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid execution identifier.');}
export function verifyExecutionHistory(reservation,events){
 exact(reservation,['intent','target','created_at']);keyCheck(reservation.intent.idempotency_key);
 if(hash(reservation.target)!==reservation.intent.target_hash||!events.length||events.length>100)throw new Error('Execution reservation/history invalid.');
 let previous=null;
 for(const [i,row] of events.entries()){
  exact(row,['domain','execution_key','sequence','previous_hash','event_type','created_at','receipt','event_hash']);const {event_hash,...content}=row;
  if(row.domain!=='leqvor-root-execution-event-v1'||row.execution_key!==reservation.intent.idempotency_key||row.sequence!==i+1||row.previous_hash!==previous||hash(content)!==event_hash||
     (i===0?row.event_type!=='ATTEMPTED':!['OUTCOME_UNKNOWN','NOT_DISPATCHED','APPLIED','NOT_APPLIED'].includes(row.event_type))||
     (i>0&&['APPLIED','NOT_APPLIED','NOT_DISPATCHED'].includes(events[i-1].event_type))||
     (['APPLIED','NOT_APPLIED'].includes(row.event_type)!==(row.receipt!==null)))throw new Error('Execution history verification failed.');previous=event_hash;
 }
 return {reservation,events,status:events.at(-1).event_type,receipt:events.at(-1).receipt};
}
async function read(tx,key){
 const row=await tx.query('select document from founder_governance.execution_reservations where execution_key=$1 for update',[key]);if(!row.rows.length)return null;
 const events=await tx.query('select document from founder_governance.execution_events where execution_key=$1 order by sequence limit 101',[key]);return verifyExecutionHistory(row.rows[0].document,events.rows.map(r=>r.document));
}
async function append(tx,key,events,type,receipt,now){
 const content={domain:'leqvor-root-execution-event-v1',execution_key:key,sequence:events.length+1,previous_hash:events.at(-1)?.event_hash??null,event_type:type,created_at:new Date(now).toISOString(),receipt};
 const event={...content,event_hash:hash(content)};await tx.query('insert into founder_governance.execution_events(execution_key,sequence,document) values($1,$2,$3)',[key,event.sequence,event]);return event;
}
export class PostgresExecutionJournal{
 constructor(database,{clock=Date.now}={}){if(typeof database?.transaction!=='function')throw new Error('Protected execution transaction store required.');this.database=database;this.clock=clock;}
 reserve(intent,target){
  intent=structuredClone(intent);target=structuredClone(target);keyCheck(intent.idempotency_key);
  if(hash(target)!==intent.target_hash)throw new Error('Execution target mismatch.');
  return this.database.transaction(async tx=>{
   const reservation={intent,target,created_at:new Date(this.clock()).toISOString()};
   const inserted=await tx.query('insert into founder_governance.execution_reservations(execution_key,request_id,document) values($1,$2,$3) on conflict(execution_key) do nothing returning execution_key',[intent.idempotency_key,intent.request_id,reservation]);
   if(inserted.rows.length)await append(tx,intent.idempotency_key,[],'ATTEMPTED',null,this.clock());
   const current=await read(tx,intent.idempotency_key);
   if(hash(current.reservation.intent)!==hash(intent)||hash(current.reservation.target)!==hash(target))throw new Error('Execution reservation differs.');
   return {claimed:inserted.rows.length===1,...current};
  });
 }
 read(key){keyCheck(key);return this.database.transaction(tx=>read(tx,key));}
 record(key,type,receipt=null){
  keyCheck(key);receipt=structuredClone(receipt);
  if(!['OUTCOME_UNKNOWN','NOT_DISPATCHED','APPLIED','NOT_APPLIED'].includes(type))throw new Error('Unsupported execution outcome.');
  return this.database.transaction(async tx=>{
   const current=await read(tx,key);if(!current)throw new Error('Execution reservation missing.');
   if(['APPLIED','NOT_APPLIED','NOT_DISPATCHED'].includes(current.status)){
    if(current.status!==type||hash(current.receipt)!==hash(receipt))throw new Error('Terminal execution outcome cannot change.');return current;
   }
   if(current.status===type&&hash(current.receipt)===hash(receipt))return current;
   if(current.events.length>=100)throw new Error('Execution history requires reviewed archival.');
   if((['APPLIED','NOT_APPLIED'].includes(type))!==(receipt!==null))throw new Error('Verified receipt required for provider outcome.');
   const next=await append(tx,key,current.events,type,receipt,this.clock());return verifyExecutionHistory(current.reservation,[...current.events,next]);
  });
 }
}
