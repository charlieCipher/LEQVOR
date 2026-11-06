import {GovernanceEngine} from '../engine.mjs';
import {GovernanceGateway} from '../gateway.mjs';
import {PostgresGovernanceStore} from '../postgres-store.mjs';
import {connectGovernanceDatabase} from './neon-database.mjs';
import {createAccessRegistry} from './access-registry.mjs';
import {createAuth0Authenticator} from './auth0.mjs';
import {createRenderServer} from './render-server.mjs';
import {createRenderTransport} from './render-server.mjs';
import {loadConsoleHandler} from './console-host.mjs';

export async function assembleRenderControl(config,{connect=connectGovernanceDatabase,fetchImpl=fetch,keyResolver,clock=Date.now,recordOutcome}={}){
 // Validate transport before opening any database connections.
 createRenderTransport(config);
 const access=await createAccessRegistry({url:config.accessUrl,key:config.accessKey,issuer:config.accessIssuer,identityIssuer:config.issuer,controlOrigin:config.origin,readToken:config.accessToken,fetchImpl,clock});
 const authenticate=createAuth0Authenticator({issuer:config.issuer,clientId:config.clientId,isSessionActive:access.isSessionActive,clock,keyResolver});
 const db=await connect(config);
 try{
  // Pin originates in independent reviewed service configuration, never the
  // request, mutable root_state, customer Supabase or an auto-discovery path.
  const engine=new GovernanceEngine(new PostgresGovernanceStore(db.database),{clock,policyPin:async()=>config.policyPin});
  const gateway=new GovernanceGateway({engine,authenticate,getRole:access.lookupRole,clock});
  const consoleHandler=await loadConsoleHandler({origin:config.origin,issuer:config.issuer,clientId:config.clientId,policyPin:config.policyPin,checkpoint:config.consoleCheckpoint,isSecureTransport:createRenderTransport(config)});
  return {server:createRenderServer({gateway,origin:config.origin,proxyCidrs:config.proxyCidrs,healthy:db.healthy,consoleHandler,clock,recordOutcome}),closeDatabase:db.close};
 }catch(error){await db.close();throw error;}
}
