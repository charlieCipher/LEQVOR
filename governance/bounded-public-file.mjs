import {open} from 'node:fs/promises';
// Check the file type/size first, then cap the actual read as well: a file
// growing after stat must not turn a public import into an unbounded read.
export async function readBoundedPublicFile(path,limit=4194304){
 if(!Number.isSafeInteger(limit)||limit<1||limit>4194304)throw new Error('Invalid public file limit.');
 const handle=await open(path,'r');
 try{
  const stat=await handle.stat();if(!stat.isFile()||stat.size>limit)throw new Error('Bounded regular public file required.');
  const buffer=Buffer.alloc(limit+1);let length=0;
  while(length<buffer.length){const result=await handle.read(buffer,length,buffer.length-length,null);if(result.bytesRead===0)break;length+=result.bytesRead;}
  if(length>limit)throw new Error('Public file grew beyond reviewed capacity.');
  return buffer.subarray(0,length);
 }finally{await handle.close();}
}
