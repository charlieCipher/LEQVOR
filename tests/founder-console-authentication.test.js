import {it,expect} from 'vitest';
import {webcrypto} from 'node:crypto';
import {mountAuthenticatedConsole} from '../governance/control/console-session.js';

it('leaving the existing console for fresh authentication preserves only its new one-use PKCE transaction',async()=>{
 const root=document.createElement('main');document.body.append(root);const data=new Map(),origin='https://control.example';let redirected;
 const win={location:{origin,href:origin+'/',pathname:'/',assign:value=>{redirected=value;}},history:{replaceState(){}},crypto:webcrypto,sessionStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},fetch:async()=>{throw new Error('No live provider in fixture.');}};
 const dispose=await mountAuthenticatedConsole({root,window:win,config:{origin,issuer:'https://tenant.example/',clientId:'fixture',policyPin:'a'.repeat(64),checkpoint:{policy_hash:'a'.repeat(64),version:1,sequence:0,event_hash:null,state_hash:'b'.repeat(64)}}});
 try{
  expect(root.textContent).toContain('Founder Authority is not activated');
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Sign in with MFA').click();
  for(let i=0;!redirected&&i<50;i++)await new Promise(r=>setTimeout(r,10));
  expect(new URL(redirected).searchParams.get('code_challenge_method')).toBe('S256');
  const before=[...data.values()][0];expect(JSON.parse(before).verifier).toHaveLength(43);
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
  expect([...data.values()][0]).toBe(before);expect(root.textContent).not.toContain('Locally signed public approval file');
 }finally{dispose();root.remove();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});}
});
