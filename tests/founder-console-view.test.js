import {it,expect,vi,afterEach} from 'vitest';
import {mountControlConsole} from '../governance/control/console-view.js';
import {fireEvent,waitFor} from '@testing-library/react';

afterEach(()=>document.body.replaceChildren());
function fixture(){const root=document.createElement('main');document.body.append(root);const client={importAuthority:vi.fn(async()=>({verified:true})),advanceAuthority:vi.fn(),read:vi.fn(async()=>({status:'PENDING',target:'<script>never run</script>\u202e'})),request:vi.fn(),approve:vi.fn(),clear:vi.fn()};const unmount=mountControlConsole(root,client);return {root,client,unmount};}
function button(root,label){return Array.from(root.querySelectorAll('button')).find(b=>b.textContent===label);}
function input(root,label){return Array.from(root.querySelectorAll('label')).find(l=>l.firstChild.textContent===label).querySelector('input');}
function choose(element,text){Object.defineProperty(element,'files',{configurable:true,value:[{size:text.length,text:async()=>text}]});}

it('renders labelled separate controls and public output as safe text',async()=>{
 const f=fixture();expect(f.root.querySelector('h1').textContent).toBe('LEQVOR Control Console');
 for(const element of f.root.querySelectorAll('input,select'))expect(element.parentElement.tagName).toBe('LABEL');
 fireEvent.click(button(f.root,'Read verified governance state'));
 await waitFor(()=>expect(f.root.querySelector('pre').textContent).toContain('PENDING'));
 expect(f.root.querySelector('script')).toBeNull();expect(f.root.querySelector('pre').textContent).toContain('\\u202e');expect(f.root.querySelector('[role="status"]')).not.toBeNull();f.unmount();
});
it('rejects malformed/oversized imports and hides provider errors',async()=>{
 const f=fixture(),authority=input(f.root,'Independent public authority file');choose(authority,'invalid json');fireEvent.click(button(f.root,'Import independent authority'));
 await waitFor(()=>expect(f.root.querySelector('[role="status"]').textContent).toBe('Invalid JSON file.'));expect(f.client.importAuthority).not.toHaveBeenCalled();
 choose(authority,'x'.repeat(65537));fireEvent.click(button(f.root,'Import independent authority'));await waitFor(()=>expect(f.root.querySelector('[role="status"]').textContent).toContain('could not complete'));expect(f.client.importAuthority).not.toHaveBeenCalled();
 f.client.read.mockRejectedValueOnce(new Error('secret-provider-token'));fireEvent.click(button(f.root,'Read verified governance state'));await waitFor(()=>expect(f.client.read).toHaveBeenCalled());await waitFor(()=>expect(button(f.root,'Read verified governance state').disabled).toBe(false));expect(f.root.textContent).not.toContain('secret-provider-token');f.unmount();
});
it('clears on explicit exit and background, never displaying a late result',async()=>{
 const f=fixture();let resolve;f.client.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));fireEvent.click(button(f.root,'Read verified governance state'));
 fireEvent.click(button(f.root,'Clear control session'));resolve({late:'must not display'});await waitFor(()=>expect(button(f.root,'Read verified governance state').disabled).toBe(false));expect(f.root.textContent).not.toContain('must not display');
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});fireEvent(document,new Event('visibilitychange'));expect(f.client.clear).toHaveBeenCalledTimes(2);f.unmount();expect(f.root.childElementCount).toBe(0);Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
});
it('does not import a file that finishes reading after the view was cleared',async()=>{
 const f=fixture(),authority=input(f.root,'Independent public authority file');let resolve;
 Object.defineProperty(authority,'files',{configurable:true,value:[{size:2,text:()=>new Promise(r=>{resolve=r;})}]});fireEvent.click(button(f.root,'Import independent authority'));
 fireEvent.click(button(f.root,'Clear control session'));resolve('{}');await waitFor(()=>expect(button(f.root,'Import independent authority').disabled).toBe(false));expect(f.client.importAuthority).not.toHaveBeenCalled();f.unmount();
});
