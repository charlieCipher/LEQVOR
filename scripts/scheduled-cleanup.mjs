import { timingSafeEqual } from 'node:crypto';
import { cleanupBatch } from './ciphertext-cleanup.mjs';

// Fail closed before constructing a backend client or sending credentials.
export async function scheduledCleanup({method, authorization, env, run=cleanupBatch}) {
  if (method !== 'GET') return {status:405, body:{error:'Method not allowed'}};
  if (env.CLEANUP_ENABLED !== 'true') return {status:503,body:{error:'Cleanup disabled'}};
  const secret=env.CRON_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) return {status:503,body:{error:'Cleanup not configured'}};
  const expected=Buffer.from(`Bearer ${secret}`);
  const supplied=Buffer.from(typeof authorization === 'string' ? authorization : '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return {status:401,body:{error:'Unauthorized'}};
  if (env.SUPABASE_URL !== 'https://awdsyhxdnyfilnzamflt.supabase.co' || !env.SUPABASE_SERVICE_ROLE_KEY)
    return {status:503,body:{error:'Cleanup not configured'}};
  try {
    // Bound execution to fit the server function deadline. Failed jobs stay queued.
    const outcome=await run({url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY,limit:5,timeoutMs:4000});
    return {status:outcome.failed ? 503 : 200,body:outcome};
  } catch { return {status:503,body:{error:'Cleanup failed; queued jobs will be retried'}}; }
}
