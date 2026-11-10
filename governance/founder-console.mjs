// Local, offline inspection. No web listener, credential generation or fallback.
import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {validatePolicy,validateRequest,approvalCommitment,encode,hash} from './protocol.mjs';
const effects={
 REMOVE_FOUNDER_ROOT:'Remove founder authority.',DISABLE_FOUNDER_PROTECTION:'Disable founder protection.',TRANSFER_PLATFORM_OWNERSHIP:'Transfer platform ownership.',REPLACE_FOUNDER_IDENTITY:'Replace a founder identity.',CHANGE_ROOT_POLICY:'Change root governance policy.',CHANGE_ROOT_THRESHOLD:'Change root approval threshold.',TRANSFER_CRITICAL_INFRASTRUCTURE:'Transfer critical infrastructure.',DELETE_GOVERNANCE_CONFIGURATION:'Delete governance configuration.',GOVERNANCE_FREEZE:'Freeze governance mutations. Provider enforcement requires its protected adapter.',GOVERNANCE_UNFREEZE:'Remove the governance freeze.',CANCEL_GOVERNANCE_REQUEST:'Cancel the exact pending proposal.'
};
const json=async path=>{const text=await readFile(path,'utf8');if(Buffer.byteLength(text)>16384)throw new Error('Public artifact exceeds size limit.');return JSON.parse(text);};
try{
 if(process.argv.length!==7)throw new Error('Usage: node governance/founder-console.mjs <independent-policy.json> <request.json> <target-artifact.json> <current-version> <A|B|C>');
 const [policy,request,target]=await Promise.all(process.argv.slice(2,5).map(json)),version=Number(process.argv[5]),slot=process.argv[6];
 validatePolicy(policy);validateRequest(request,policy,version,Date.now());if(hash(target)!==request.target)throw new Error('Target artifact does not match the signed commitment.');
 const credential=policy.credentials.find(c=>c.slot===slot);if(!credential)throw new Error('Choose the local registered slot.');
 console.log(`LEQVOR Founder Console — offline inspection only\nAction: ${request.action}\nEffect: ${effects[request.action]}\nTarget artifact:\n${JSON.stringify(target,null,2)}\nSlot: ${slot}\nPinned key: ${credential.key_id}\nVersion: ${version}\nPolicy hash: ${request.policy_hash}\nPhase: ${request.phase}\nExpires: ${request.expires_at}\nExact approval bytes (UTF-8):\n${encode(approvalCommitment(request,credential.key_id)).toString('utf8')}\n\nHardware signer unavailable. Nothing signed or executed. Do not use a software private-key fallback.`);
}catch(error){console.error(error.message);process.exitCode=1;}
