import {ROOT_ACTIONS} from '../public-values.mjs';

const display=value=>JSON.stringify(value,null,2).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`);
async function filePacket(input){const file=input.files?.[0];if(!file||file.size>65536)throw new Error('Choose a public JSON file no larger than 64 KiB.');return JSON.parse(await file.text());}

// Separate admin surface only. The reviewed hosting entry must inject the
// configured client. No automatic login, localStorage, inline HTML or signer.
export function mountControlConsole(root,client){
 if(!root||!client)throw new Error('Configured control client required.');
 const doc=root.ownerDocument,controls=[];let revision=0,destroyed=false,lastVerified=null;
 function node(tag,text){const element=doc.createElement(tag);if(text)element.textContent=text;return element;}
 const title=node('h1','LEQVOR Control Console'),notice=node('p','Founder Authority is not activated. This console prepares requests and submits public approvals; it cannot sign or execute root actions.'),status=node('p');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const result=node('pre');result.setAttribute('aria-label','Verified public result');result.tabIndex=0;
 const form=node('form');
 function field(label,type){const box=node('label',label),input=node('input');input.type=type;if(type==='file')input.accept='application/json,.json';box.append(input);form.append(box);controls.push(input);return input;}
 const authority=field('Independent public authority file','file'),checkpoint=field('New two-founder signed checkpoint (when advancing)','file');
 const actionLabel=node('label','Root action'),action=node('select');for(const value of ROOT_ACTIONS){const option=node('option',value);option.value=value;action.append(option);}actionLabel.append(action);form.append(actionLabel);controls.push(action);
 const target=field('Complete public target artifact','file'),proposal=field('Proposal ID (only for a cooled confirmation)','text'),requestId=field('Pending request ID for approval','text'),approval=field('Locally signed public approval file','file');
 const buttons=node('div');form.append(buttons);
 async function work(operation){
  const stamp=revision;for(const c of controls)c.disabled=true;lastVerified=null;result.textContent='';status.textContent='Verifying public input…';
  const ensure=()=>{if(destroyed||stamp!==revision)throw new Error('Control view cleared.');};
  try{const value=await operation(ensure);if(!destroyed&&stamp===revision){lastVerified=structuredClone(value);result.textContent=display(value);status.textContent='Public verification completed. Mutations require a newer independently signed checkpoint before continuing.';}}
  catch(error){if(!destroyed&&stamp===revision){status.textContent=error instanceof SyntaxError?'Invalid JSON file.':'Control operation could not complete. Check the configured session, public files and independent checkpoint.';result.textContent='';}}
  finally{if(!destroyed)for(const c of controls)c.disabled=false;}
 }
 function button(label,operation){const b=node('button',label);b.type='button';b.addEventListener('click',()=>work(operation));buttons.append(b);controls.push(b);return b;}
 async function load(input,ensure){const value=await filePacket(input);ensure();return value;}
 button('Import independent authority',async ensure=>client.importAuthority(await load(authority,ensure)));
 button('Advance with signed checkpoint',async ensure=>client.advanceAuthority(await load(authority,ensure),await load(checkpoint,ensure)));
 button('Read verified governance state',()=>client.read());
 button('Prepare root request',async ensure=>client.request(action.value,await load(target,ensure),proposal.value.trim()||null));
 button('Submit local approval',async ensure=>client.approve(requestId.value.trim(),await load(approval,ensure),await load(target,ensure)));
 const download=node('button','Export verified public JSON');download.type='button';controls.push(download);buttons.append(download);
 download.addEventListener('click',()=>{
  if(!lastVerified){status.textContent='Complete public verification before exporting.';return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(lastVerified,null,2)],{type:'application/json'})),link=node('a');link.href=url;link.download='leqvor-governance-public.json';
  try{link.click();}finally{URL.revokeObjectURL(url);}
 });
 const clear=node('button','Clear control session');clear.type='button';
 function clearAll(){revision++;try{client.clear();}finally{lastVerified=null;result.textContent='';for(const input of [authority,checkpoint,target,proposal,requestId,approval])input.value='';status.textContent='Control session and imported public state cleared.';}}
 clear.addEventListener('click',clearAll);form.addEventListener('submit',event=>event.preventDefault());
 function background(){if(doc.visibilityState==='hidden')clearAll();}
 doc.addEventListener('visibilitychange',background);root.replaceChildren(title,notice,form,clear,status,result);
 return ()=>{destroyed=true;clearAll();doc.removeEventListener('visibilitychange',background);root.replaceChildren();};
}
