// Offline CLI: reads one public request; no listener, network or private key.
import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {inspectFounderRequest} from './founder-protocol.mjs';
try{
 if(process.argv.length!==3)throw new Error('Usage: node scripts/founder-inspect.mjs <public-request.json>');
 const text=await readFile(process.argv[2],'utf8');if(Buffer.byteLength(text)>4096)throw new Error('Request exceeds size limit.');
 const request=JSON.parse(text),result=inspectFounderRequest(request);
 console.log(`LEQVOR FOUNDER REQUEST — INSPECTION ONLY\nAction: ${request.action}\nTarget: ${request.target}\nEffect: ${result.effect}\nPhase: ${request.phase}\nGovernance version: ${request.governance_version}\nExpires: ${request.expires_at}\nSHA-256: ${result.digest}\nExact signing bytes (UTF-8):\n${result.bytes.toString('utf8')}\n\nNo approval signed. No governance change performed.`);
}catch(error){console.error(error.message);process.exitCode=1;}
