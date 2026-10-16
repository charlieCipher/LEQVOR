import {hash} from './protocol.mjs';
// Inject a separately protected PostgreSQL transaction provider. No Supabase
// service credential, HTTP route, or bootstrap endpoint is supplied here.
export class PostgresGovernanceStore{
 constructor(database){this.database=database;}
 transaction(operation){return this.database.transaction(async tx=>{
  const read=await tx.query('select document from founder_governance.root_state where singleton=true for update');
  if(read.rows.length!==1)throw new Error('Founder authority is not enrolled.');
  const state=structuredClone(read.rows[0].document),before=state.audit.length;
  const history=await tx.query('select document from founder_governance.audit_events order by sequence limit 10001');
  if(before>10000||history.rows.length!==before||history.rows.some((row,i)=>hash(row.document)!==hash(state.audit[i])))throw new Error('Governance audit storage mismatch.');
  const result=await operation(state);
  for(const event of state.audit.slice(before))await tx.query('insert into founder_governance.audit_events(sequence,event_hash,document) values($1,$2,$3)',[event.sequence,event.event_hash,event]);
  await tx.query('update founder_governance.root_state set document=$1 where singleton=true',[state]);
  return result;
 });}
}
