import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadConsoleHandler} from './console-host.mjs';
test('same-origin console exposes only reviewed browser assets/public configuration and does not manufacture missing authority',async()=>{
 const handler=await loadConsoleHandler({origin:'https://control.example',issuer:'https://tenant.example/',clientId:'fixture',isSecureTransport:req=>req.secure===true});
 const send=(url,changes={})=>{const req={url,method:'GET',rawHeaders:['Host','control.example'],headers:{host:'control.example'},secure:true,...changes},res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body?.toString();}};return {handled:handler(req,res),...res};};
 const index=send('/auth/callback?code=fixture&state=fixture');assert.equal(index.status,200);assert.equal(index.body.includes('fixture'),false);assert.equal(index.headers['Referrer-Policy'],'no-referrer');assert.equal(index.body.includes('console-bootstrap.js'),true);
 assert.deepEqual(JSON.parse(send('/control-config.json').body),{origin:'https://control.example',issuer:'https://tenant.example/',clientId:'fixture'});
 assert.equal(send('/control/pkce-session.js').status,200);assert.equal(send('/public-values.mjs').status,200);
 for(const path of ['/control/.env.local','/control/start.mjs','/control/../.env','/authorization-directory.sql','/control/node_modules/pg/package.json'])assert.equal(send(path).handled,false);
 assert.equal(send('/',{secure:false}).status,403);assert.equal(send('/',{headers:{host:'control.example',cookie:'fixture'}}).status,403);
 assert.equal(send('/',{rawHeaders:['Host','control.example','host','attacker.example']}).status,403);
});
