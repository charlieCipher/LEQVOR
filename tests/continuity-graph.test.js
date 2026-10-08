// @vitest-environment node
import {it,expect} from 'vitest';
import {ContinuityGraphService} from '../src/modules/continuity/ContinuityGraphService';
import {VaultSession} from '../src/modules/security/VaultSession';
import {validateRelationship} from '../src/modules/continuity/graph';
import {encryptedWrite} from '../src/lib/ciphertextBoundary';
const vault={id:'vault',owner_id:'owner'};
const person={id:'person',owner_id:'owner',vault_id:'vault',entity_type:'PERSON'};
const asset={id:'asset',owner_id:'owner',vault_id:'vault',entity_type:'ASSET'};
it('rejects invalid directions, legal authority verbs and fractional allocations',()=>{
 for(const [from,to,relation,bps] of [[asset,person,'OWNS'],[person,asset,'TRANSFER'],[person,asset,'OWNS',50.5],[person,asset,'OWNS',10001],[person,person,'TRUSTED_FOR']])
  expect(()=>validateRelationship(from,to,relation,bps)).toThrow();
 expect(()=>validateRelationship(person,asset,'NOMINEE_FOR',5000)).not.toThrow();
});
it('encrypts relationship semantics, binds endpoints and respects Cold Lock',async()=>{
 const session=new VaultSession();
 session.unlock(await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']));
 let stored;
 const db={graphEntities:async()=>[person,asset],graphEdges:async()=>[stored],saveGraphEdge:async row=>stored=encryptedWrite('edge',row)};
 const service=new ContinuityGraphService(session,vault,db);
 try {
  await service.link(person,asset,{relation_type:'NOMINEE_FOR',allocation_bps:5000,notes:'PRIVATE_NOMINATION'});
  const wire=JSON.stringify(stored);
  expect(wire).not.toContain('PRIVATE_NOMINATION');expect(wire).not.toContain('NOMINEE_FOR');expect(wire).not.toContain('5000');
  expect((await service.getGraph()).edges[0]).toMatchObject({relation_type:'NOMINEE_FOR',allocation_bps:5000});
  stored={...stored,from_entity_id:'asset',to_entity_id:'person'};
  await expect(service.getGraph()).rejects.toThrow('integrity');
  expect(()=>service.link({...person,owner_id:'intruder'},asset,{relation_type:'OWNS'})).toThrow();
  session.lock();await expect(service.getGraph()).rejects.toThrow('Unlock');
 } finally {session.dispose();}
});
