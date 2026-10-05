// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {scheduledCleanup} from '../scripts/scheduled-cleanup.mjs';
const env={CLEANUP_ENABLED:'true',CRON_SECRET:'synthetic-scheduler-secret-for-tests-only',SUPABASE_URL:'https://awdsyhxdnyfilnzamflt.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key'};
it('rejects unauthenticated or misconfigured invocations without backend access',async()=>{
 const run=vi.fn();
 for(const request of [{method:'POST'},{env:{...env,CLEANUP_ENABLED:undefined}},{authorization:''},{authorization:'Bearer wrong'},{env:{...env,CRON_SECRET:''}},{env:{...env,SUPABASE_URL:'https://other.invalid'}}]) {
  const result=await scheduledCleanup({method:'GET',authorization:`Bearer ${env.CRON_SECRET}`,env,run,...request});
  expect(result.status).toBeGreaterThanOrEqual(400);
 }
 expect(run).not.toHaveBeenCalled();
});
it('runs only a bounded authenticated batch and exposes counts only',async()=>{
 const run=vi.fn().mockResolvedValue({completed:2,failed:0});
 expect(await scheduledCleanup({method:'GET',authorization:`Bearer ${env.CRON_SECRET}`,env,run})).toEqual({status:200,body:{completed:2,failed:0}});
 expect(run).toHaveBeenCalledWith({url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY,limit:5,timeoutMs:4000});
});
it('reports failures without exposing credentials or backend messages',async()=>{
 const run=vi.fn().mockRejectedValue(new Error('PRIVATE_CANARY'));
 const result=await scheduledCleanup({method:'GET',authorization:`Bearer ${env.CRON_SECRET}`,env,run});
 expect(result.status).toBe(503);
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CANARY|synthetic-server-key/);
});
