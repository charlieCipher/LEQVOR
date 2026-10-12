// Shared public encoding only: no Node APIs, keys, network or mutable state.
export const ROOT_ACTIONS=Object.freeze(['REMOVE_FOUNDER_ROOT','DISABLE_FOUNDER_PROTECTION','TRANSFER_PLATFORM_OWNERSHIP','REPLACE_FOUNDER_IDENTITY','CHANGE_ROOT_POLICY','CHANGE_ROOT_THRESHOLD','TRANSFER_CRITICAL_INFRASTRUCTURE','DELETE_GOVERNANCE_CONFIGURATION','GOVERNANCE_FREEZE','GOVERNANCE_UNFREEZE','CANCEL_GOVERNANCE_REQUEST']);
export function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isSafeInteger(value))return value;
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 throw new Error('Unsupported canonical value.');
}
export function exact(value,fields){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==fields.length||fields.some(k=>!Object.hasOwn(value,k)))throw new Error('Unsupported packet fields.');}
export const publicText=value=>JSON.stringify(canonical(value));
