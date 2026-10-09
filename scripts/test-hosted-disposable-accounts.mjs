// Explicitly authorized hosted acceptance with disposable accounts only.
// Load server credentials privately with node --env-file=.env.local.
import process from 'node:process';
import {randomBytes, randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {runHostedWorkflow} from './check-hosted-workflow.mjs';
import {runHostedDocuments} from './check-hosted-documents.mjs';
import {runHostedSharing} from './check-hosted-sharing.mjs';
import {runHostedArchitecture} from './check-hosted-architecture.mjs';

const target='https://awdsyhxdnyfilnzamflt.supabase.co';
const env=process.env;
const url=env.SUPABASE_URL;
const adminKey=env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey=env.LEQVOR_TEST_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const report=line=>console.log(line);
const users=[];
const clients=[];
let stage='configuration';
let success=false;
let cleanupFailed=false;

if (!process.argv.includes('--run-hosted-test') || url!==target || !adminKey || !publicKey) {
  report('BLOCKED: explicit --run-hosted-test, matching SUPABASE_URL, server-only admin key and public project key required. No writes attempted.');
  process.exitCode=2;
} else if(adminKey===publicKey || adminKey.startsWith('sb_publishable_')) {
  report('BLOCKED: the configured server key is a public frontend key, which cannot administer Auth. No writes attempted.');
  process.exitCode=2;
} else {
  const admin=createClient(url,adminKey,options);
  try {
    for (const label of ['a','b']) {
      stage=`create temporary account ${label}`;
      const email=`leqvor-test-${label}-${randomUUID()}@example.invalid`;
      const password=randomBytes(48).toString('base64url');
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
      if(created.error || !created.data.user?.id) {
        const status=Number.isInteger(created.error?.status)?created.error.status:'unknown';
        const code=/^[a-z0-9_]+$/i.test(created.error?.code||'')?created.error.code:'unknown';
        report(`Auth admin failure: HTTP ${status}, code ${code}`);
        throw new Error('Account creation failed');
      }
      users.push(created.data.user.id);
      stage=`authenticate temporary account ${label}`;
      const client=createClient(url,publicKey,options);
      clients.push(client);
      const signed=await client.auth.signInWithPassword({email,password});
      if(signed.error || signed.data.user?.id!==created.data.user.id) throw new Error('Authentication failed');
    }
    stage='ordinary-user hosted workflow';
    success=await (process.argv.includes('--architecture')?runHostedArchitecture:process.argv.includes('--sharing')?runHostedSharing:process.argv.includes('--documents')?runHostedDocuments:runHostedWorkflow)(clients[0],clients[1],report,{hostedHttp:process.argv.includes('--sharing-http'),securityHistory:process.argv.includes('--security-history')});
  } catch {
    report(`FAIL ${stage}; credentials and sensitive responses suppressed`);
  } finally {
    for(const client of clients) {
      try {await client.auth.signOut();} catch { /* account deletion invalidates access below */ }
    }
    // IDs originate only from successful createUser calls in this invocation.
    for(const id of users) {
      try {
        if(process.argv.includes('--sharing')||process.argv.includes('--architecture')){
          const keys=await admin.from('user_sharing_keys').delete().eq('owner_id',id);
          if(keys.error){cleanupFailed=true;continue;}
        }
        const removed=await admin.auth.admin.deleteUser(id);
        if(removed.error) {cleanupFailed=true;continue;}
        const remaining=await admin.auth.admin.getUserById(id);
        if(remaining.data?.user || remaining.error?.status!==404) cleanupFailed=true;
      } catch {cleanupFailed=true;}
    }
    report(cleanupFailed?'FAIL temporary-account cleanup; inspect only generated leqvor-test accounts':users.length?'PASS temporary accounts removed and absence verified':'No temporary accounts created');
  }
  process.exitCode=success&&!cleanupFailed?0:1;
}
