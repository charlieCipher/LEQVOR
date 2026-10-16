import {readFile} from 'node:fs/promises';
import {verifySnapshot,verifyCheckpointPacket} from './audit.mjs';
import {hash} from './protocol.mjs';
const json=async path=>{const bytes=await readFile(path);if(bytes.length>16*1024*1024)throw new Error('Public audit file too large.');return JSON.parse(bytes.toString('utf8'));};
try{
 if(process.argv.length!==5&&process.argv.length!==6)throw new Error('Usage: node governance/audit-inspect.mjs <independent-policy.json> <snapshot.json> <independent-checkpoint.json> [signed-checkpoint-packet.json]');
 const [policy,state,expected]=await Promise.all(process.argv.slice(2,5).map(json));verifySnapshot(state,expected,policy);
 if(process.argv[5]){const packet=await json(process.argv[5]);if(hash(packet.checkpoint)!==hash(expected)||!verifyCheckpointPacket(packet,policy))throw new Error('Checkpoint quorum signature failed.');}
 console.log(`Verified public audit: ${expected.sequence} events; governance version ${expected.version}; frozen ${state.frozen}; policy ${expected.policy_hash}; state ${expected.state_hash}. No keys, permissions or infrastructure changed.`);
}catch(error){console.error(error.message);process.exitCode=1;}
