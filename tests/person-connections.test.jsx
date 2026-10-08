import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import PersonConnections from '../src/components/people/PersonConnections';
import {personConnections} from '../src/modules/continuity/personConnections';
import {readProfessionalDetails} from '../src/modules/continuity/professionalDetails';
afterEach(cleanup);
const graph={entities:[{id:'p',entity_type:'PERSON'},{id:'a',entity_type:'ASSET'},{id:'d',entity_type:'DOCUMENT'}],edges:[{from_entity_id:'p',to_entity_id:'a',relation_type:'OWNS'},{from_entity_id:'p',to_entity_id:'a',relation_type:'NOMINEE_FOR'},{from_entity_id:'d',to_entity_id:'p',relation_type:'ORIGINAL_HELD_BY'}]};
const records=[{id:'a',title:'PRIVATE_ASSET'},{id:'d',title:'PRIVATE_DOCUMENT'}];
it('groups multiple recorded roles without inventing access or including missing records',()=>{
 const rows=personConnections('p',graph,records);
 expect(rows).toHaveLength(2);
 expect(rows[0].relationships).toEqual(['Recorded owner','Recorded nominee']);
 expect(rows[1]).toMatchObject({type:'DOCUMENT',relationships:['Original custodian']});
 expect(personConnections('other',graph,records)).toEqual([]);
 expect(personConnections('p',graph,[])).toEqual([]);
});
it('does not decrypt connections before reveal and clears them on focus loss',async()=>{
 const service={graph:{getGraph:vi.fn().mockResolvedValue(graph)}};
 render(<PersonConnections person={{id:'p'}} records={records} service={service} onOpen={()=>{}}/>);
 expect(service.graph.getGraph).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Reveal connections'}));
 await screen.findByText('PRIVATE_DOCUMENT');
 fireEvent(window,new Event('blur'));
 expect(screen.queryByText('PRIVATE_DOCUMENT')).toBeNull();
});
it('does not restore revealed connections when an in-flight request resolves after blur',async()=>{
 let finish;const service={graph:{getGraph:()=>new Promise(resolve=>{finish=resolve;})}};
 render(<PersonConnections person={{id:'p'}} records={records} service={service} onOpen={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Reveal connections'}));
 fireEvent(window,new Event('blur'));finish(graph);
 await screen.findByRole('button',{name:'Reveal connections'});
 expect(screen.queryByText('PRIVATE_DOCUMENT')).toBeNull();
});
it('validates professional context and never treats a recorded status as verification',()=>{
 const form=new FormData();expect(readProfessionalDetails(form)).toBeNull();
 form.set('professional_country','in');form.set('professional_status','ACTIVE');
 expect(readProfessionalDetails(form)).toMatchObject({country:'IN',status:'ACTIVE',verification_status:'UNVERIFIED'});
 form.set('professional_country','India');expect(()=>readProfessionalDetails(form)).toThrow();
});
