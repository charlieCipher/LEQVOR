// Process-local protection, keyed only by the real transport peer. A reviewed
// distributed limiter is still needed for multi-instance/proxy deployments.
export function createPeerAdmission({capacity=10,refillPerSecond=0.5,maxPeers=128,idleMs=600000,clock=Date.now}={}){
 if(!Number.isSafeInteger(capacity)||capacity<1||!Number.isFinite(refillPerSecond)||refillPerSecond<=0||!Number.isSafeInteger(maxPeers)||maxPeers<1||!Number.isSafeInteger(idleMs)||idleMs<1000)throw new Error('Invalid bounded admission policy.');
 const peers=new Map();let last=0;
 return req=>{
  const peer=req.socket?.remoteAddress,time=clock();if(typeof peer!=='string'||!peer||peer.length>128||!Number.isFinite(time))return false;
  const now=Math.max(last,time);last=now;
  for(const [key,value] of peers)if(now-value.seen>=idleMs)peers.delete(key);
  let bucket=peers.get(peer);
  if(!bucket){if(peers.size>=maxPeers)return false;bucket={tokens:capacity,updated:now,seen:now};peers.set(peer,bucket);}
  bucket.tokens=Math.min(capacity,bucket.tokens+(now-bucket.updated)*refillPerSecond/1000);bucket.updated=now;bucket.seen=now;
  if(bucket.tokens<1)return false;bucket.tokens--;return true;
 };
}
