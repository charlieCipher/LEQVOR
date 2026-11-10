import {exact} from './protocol.mjs';
const roles=new Set(['FOUNDER','SECURITY_ADMIN','OPERATIONS_ADMIN','SUPPORT_ADMIN','BILLING_ADMIN','AUDITOR']);
// Transport-independent boundary. authenticate/getRole are trusted server
// adapters, never values from the submitted packet. No default admin account.
export class GovernanceGateway{
 constructor({engine,authenticate,getRole,clock=Date.now}){this.engine=engine;this.authenticate=authenticate;this.getRole=getRole;this.clock=clock;}
 async handle(token,packet){
  if(typeof token!=='string'||token.length>8192||!token)throw new Error('Control authentication required.');
  const principal=await this.authenticate(token),now=this.clock();
  if(!principal||typeof principal.id!=='string'||principal.audience!=='leqvor-control-console'||!Number.isFinite(principal.expires_at)||principal.expires_at<=now)throw new Error('Invalid control session.');
  const role=await this.getRole(principal.id);if(!roles.has(role))throw new Error('No control-console role assigned.');
  if(!packet||typeof packet!=='object')throw new Error('Invalid gateway packet.');
  if(packet.operation==='read'){
   exact(packet,['operation','checkpoint']);if(!['FOUNDER','SECURITY_ADMIN','AUDITOR'].includes(role))throw new Error('Governance read denied.');
   return this.engine.snapshot(packet.checkpoint);
  }
  if(!['FOUNDER','SECURITY_ADMIN'].includes(role))throw new Error('Root request submission denied.');
  if(principal.mfa_verified!==true||!Number.isFinite(principal.authenticated_at)||principal.authenticated_at>now+30000||principal.authenticated_at<now-300000)throw new Error('Fresh control authentication and MFA required.');
  if(packet.operation==='request'){
   exact(packet,['operation','command','checkpoint']);exact(packet.command,['action','target','proposal_id']);
   return this.engine.request(packet.command,packet.checkpoint);
  }
  if(packet.operation==='approve'){
   exact(packet,['operation','request_id','approval','checkpoint']);return this.engine.approve(packet.request_id,packet.approval,packet.checkpoint);
  }
  // No execute/override/bootstrap/reset/recovery route. Root authorization is
  // not an execution receipt and does not transfer provider ownership.
  throw new Error('Unsupported governance operation.');
 }
}
