import {AurevaError} from '../security/safeEvents';
const unavailable=()=>new AurevaError('DEVICE_STORAGE_UNAVAILABLE','This browser cannot retain a device signing key. Device registration has not completed.');
// Browser-profile key custody, not hardware attestation. No VMK is stored here.
export class DeviceKeyStore{
 constructor(runtime=globalThis){this.runtime=runtime;}
 async operation(scope,mode,value){
  if(this.runtime.isSecureContext!==true||!this.runtime.indexedDB)throw unavailable();
  return new Promise((resolve,reject)=>{
   let database,settled=false;
   const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);database?.close();if(error)reject(unavailable());else resolve(result);};
   const timer=setTimeout(()=>finish(true),5000);
   const open=this.runtime.indexedDB.open('leqvor-device-keys-v1',1);
   open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('keys'))open.result.createObjectStore('keys');};
   open.onerror=open.onblocked=()=>finish(true);
   open.onsuccess=()=>{
    database=open.result;if(settled){database.close();return;}
    try{
     const tx=database.transaction('keys',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('keys');
     const request=mode==='get'?store.get(scope):mode==='add'?store.add(value,scope):store.delete(scope);
     tx.oncomplete=()=>finish(false,request.result??null);tx.onerror=tx.onabort=()=>finish(true);
    }catch{finish(true);}
   };
  });
 }
 get(scope){return this.operation(scope,'get');}
 add(scope,value){return this.operation(scope,'add',value);}
 remove(scope){return this.operation(scope,'delete');}
}
