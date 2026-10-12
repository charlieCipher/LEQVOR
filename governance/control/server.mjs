import {createServer} from 'node:https';
import {GovernanceGateway} from '../gateway.mjs';
import {createControlAuthenticator} from './auth.mjs';
import {createControlHandler} from './http.mjs';

// Assembly only. There is deliberately no executable entry point, automatic
// listener, environment-secret discovery, first-user enrollment or role grant.
// The operator must supply a reviewed separate datastore/engine, identity
// service, revocation and role adapters, admission policy and TLS identity.
export function createControlServer({engine,identity,lookupRole,admit,origin,tls,recordOutcome,clock=Date.now}){
 if(!tls?.key||!tls?.cert||typeof lookupRole!=='function')throw new Error('Explicit TLS identity and independent role lookup required.');
 const authenticate=createControlAuthenticator({...identity,clock});
 const gateway=new GovernanceGateway({engine,authenticate,getRole:lookupRole,clock});
 const handler=createControlHandler({gateway,origin,admit,recordOutcome,isSecureTransport:req=>req.socket.encrypted===true});
 const server=createServer({key:tls.key,cert:tls.cert,minVersion:'TLSv1.3',requestTimeout:15000,headersTimeout:10000,keepAliveTimeout:1000,maxHeaderSize:16384},handler);
 server.maxHeadersCount=24;server.maxRequestsPerSocket=1;
 return server;
}
