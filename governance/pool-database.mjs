export class TransactionOutcomeUnknown extends Error{constructor(){super('Database commit outcome requires reconciliation.');this.name='TransactionOutcomeUnknown';}}
// Standard node-postgres Pool contract. One checked-out connection per complete
// transaction; never pool.query(), implicit credentials or automatic retries.
export function postgresTransactions(pool){
 if(typeof pool?.connect!=='function')throw new Error('Explicit separately protected PostgreSQL pool required.');
 return {async transaction(operation){
  const client=await pool.connect();let begun=false,committing=false,discard=false;
  try{
   await client.query('BEGIN');begun=true;
   await client.query("SET LOCAL statement_timeout = '10s'");
   await client.query("SET LOCAL lock_timeout = '3s'");
   await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
   const result=await operation({query:(sql,values)=>client.query(sql,values)});
   committing=true;await client.query('COMMIT');return result;
  }catch(error){
   if(begun)try{await client.query('ROLLBACK');}catch{discard=true;}
   if(committing){discard=true;throw new TransactionOutcomeUnknown();}throw error;
  }finally{client.release(discard);}
 }};
}
