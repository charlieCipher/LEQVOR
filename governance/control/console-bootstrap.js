import {mountAuthenticatedConsole} from './console-session.js';
const root=document.getElementById('control-root');
try{
 const response=await fetch('/control-config.json',{credentials:'omit',cache:'no-store',redirect:'error'});
 if(!response.ok)throw new Error();
 const text=await response.text();if(text.length>4096)throw new Error();
 await mountAuthenticatedConsole({root,config:JSON.parse(text),window});
}catch{root.textContent='Control console could not open. No Founder Authority was activated. Check the reviewed sign-in configuration.';}
