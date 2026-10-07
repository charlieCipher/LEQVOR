// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {runHostedWorkflow} from '../scripts/check-hosted-workflow.mjs';
function client(id,existing=false){
 const limit=vi.fn(async()=>({data:existing?[{id:'existing'}]:[],error:null}));
 return {auth:{getUser:async()=>({data:{user:{id}}})},from:vi.fn(()=>({select:()=>({limit})}))};
}
it('refuses identical accounts before touching the database',async()=>{
 const a=client('same'),b=client('same'),lines=[];
 expect(await runHostedWorkflow(a,b,line=>lines.push(line))).toBe(false);
 expect(a.from).not.toHaveBeenCalled();expect(b.from).not.toHaveBeenCalled();
 expect(lines).toEqual(['FAIL authenticate; sensitive response details suppressed']);
});
it('refuses existing vaults without writing or deleting customer data',async()=>{
 const a=client('a',true),b=client('b'),lines=[];
 expect(await runHostedWorkflow(a,b,line=>lines.push(line))).toBe(false);
 expect(a.from).toHaveBeenCalledTimes(1);expect(b.from).not.toHaveBeenCalled();
 expect(lines[0]).toContain('FAIL authenticate');
});
it('does not log credential-bearing error responses',async()=>{
 const a=client('a'),b=client('b'),lines=[];
 a.auth.getUser=async()=>{throw new Error('SECRET_TOKEN');};
 expect(await runHostedWorkflow(a,b,line=>lines.push(line))).toBe(false);
 expect(lines.join(' ')).not.toContain('SECRET_TOKEN');
});
