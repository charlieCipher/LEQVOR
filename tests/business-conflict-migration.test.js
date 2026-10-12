// @vitest-environment node
import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createDisposableDatabase} from '../scripts/check-database.mjs';
it('rolls back earlier replacements if a later function does not match the expected baseline',async()=>{
 const db=await createDisposableDatabase();
 try{
  // Restore just the first function's old code, leaving the second already
  // corrected. The migration must reject this mixed baseline atomically.
  await db.exec(`do $$declare definition text;begin
   select pg_get_functiondef('public.update_v5_record(uuid,bigint,jsonb)'::regprocedure) into definition;
   execute replace(definition,'errcode=''PT409''','errcode=''40001''');
  end $$;`);
  const migration=await readFile(new URL('../supabase/migrations/20261009_record_sharing_conflicts.sql',import.meta.url),'utf8');
  await expect(db.exec(migration)).rejects.toMatchObject({code:'P0001'});await db.exec('rollback');
  const {rows}=await db.query(`select pg_get_functiondef('public.update_v5_record(uuid,bigint,jsonb)'::regprocedure) as definition,
   has_function_privilege('anon','public.update_v5_record(uuid,bigint,jsonb)','execute') as anonymous,
   has_function_privilege('authenticated','public.update_v5_record(uuid,bigint,jsonb)','execute') as authenticated`);
  expect(rows[0].definition).toContain("errcode='40001'");expect(rows[0].anonymous).toBe(false);expect(rows[0].authenticated).toBe(true);
 }finally{await db.close();}
});
