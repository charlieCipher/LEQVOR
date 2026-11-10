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
