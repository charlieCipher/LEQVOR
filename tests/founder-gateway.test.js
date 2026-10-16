// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {GovernanceGateway} from '../governance/gateway.mjs';
const now=Date.parse('2026-10-12T12:00:00.000Z');
const context={id:'control-admin',audience:'leqvor-control-console',expires_at:now+60000,authenticated_at:now,mfa_verified:true};
function fixture(role='FOUNDER',principal=context){const engine={request:vi.fn(async()=>({pending:true})),approve:vi.fn(async()=>({pending:true})),snapshot:vi.fn(async()=>({public_state:true}))};return {engine,gateway:new GovernanceGateway({engine,authenticate:vi.fn(async()=>principal),getRole:vi.fn(async()=>role),clock:()=>now})};}
const packet={operation:'request',command:{action:'DISABLE_FOUNDER_PROTECTION',target:'a'.repeat(64),proposal_id:null},checkpoint:{}};
it('denies customer sessions, unassigned roles and ordinary administrators',async()=>{
 for(const role of ['OPERATIONS_ADMIN','SUPPORT_ADMIN','BILLING_ADMIN','AUDITOR',null]){const f=fixture(role);await expect(f.gateway.handle('token',packet)).rejects.toThrow();expect(f.engine.request).not.toHaveBeenCalled();}
 const f=fixture('FOUNDER',{...context,audience:'authenticated'});await expect(f.gateway.handle('customer-token',packet)).rejects.toThrow();
});
it('requires recent MFA and refuses client-supplied role overrides',async()=>{
 for(const principal of [{...context,mfa_verified:false},{...context,authenticated_at:now-300001},{...context,expires_at:now},{...context,authenticated_at:now+30001}]){const f=fixture('SECURITY_ADMIN',principal);await expect(f.gateway.handle('token',packet)).rejects.toThrow();expect(f.engine.request).not.toHaveBeenCalled();}
 const f=fixture();await expect(f.gateway.handle('token',{...packet,role:'FOUNDER'})).rejects.toThrow();expect(f.engine.request).not.toHaveBeenCalled();
});
it('routes signed submissions to the threshold engine without an execution or bootstrap bypass',async()=>{
 const f=fixture('SECURITY_ADMIN');await expect(f.gateway.handle('token',packet)).resolves.toEqual({pending:true});expect(f.engine.request).toHaveBeenCalledWith(packet.command,packet.checkpoint);
 for(const operation of ['execute','override','bootstrap','reset','catastrophic-recovery'])await expect(f.gateway.handle('token',{operation})).rejects.toThrow();
});
it('limits governance reads to founder, security administrator and auditor',async()=>{
 for(const role of ['FOUNDER','SECURITY_ADMIN','AUDITOR'])await expect(fixture(role).gateway.handle('token',{operation:'read',checkpoint:{}})).resolves.toEqual({public_state:true});
 await expect(fixture('SUPPORT_ADMIN').gateway.handle('token',{operation:'read',checkpoint:{}})).rejects.toThrow();
});
it('rejects sessions that expire during role lookup for both reads and mutations',async()=>{
 for(const input of [packet,{operation:'read',checkpoint:{}}]){
  const f=fixture();let time=now;
  f.gateway.clock=()=>time;f.gateway.getRole=async()=>{time=context.expires_at;return 'FOUNDER';};
  await expect(f.gateway.handle('token',input)).rejects.toThrow(/expired/);
  expect(f.engine.request).not.toHaveBeenCalled();expect(f.engine.snapshot).not.toHaveBeenCalled();
 }
});
it('rechecks MFA freshness and denies invalid or reversed clocks after role lookup',async()=>{
 for(const end of [now+300001,now-1,NaN,Infinity]){
  const f=fixture('FOUNDER',{...context,expires_at:now+600000});let time=now;
  f.gateway.clock=()=>time;f.gateway.getRole=async()=>{time=end;return 'FOUNDER';};
  await expect(f.gateway.handle('token',packet)).rejects.toThrow();expect(f.engine.request).not.toHaveBeenCalled();
 }
});
it('preserves the submitted packet while asynchronous authentication is pending',async()=>{
 const f=fixture(),submitted=structuredClone(packet);
 f.gateway.authenticate=async()=>{submitted.command.action='TRANSFER_PLATFORM_OWNERSHIP';submitted.command.target='b'.repeat(64);return context;};
 await f.gateway.handle('token',submitted);
 expect(f.engine.request).toHaveBeenCalledWith(packet.command,packet.checkpoint);
});
