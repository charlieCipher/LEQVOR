import {AurevaError} from '../security/safeEvents';
export const OWNERSHIP_TYPES=['UNKNOWN','SOLE','JOINT','OTHER'];
export const ASSET_GROUPS=['owners','nominees','beneficiaries'];
export function readAssetDetails(form,people=[]){
 const fail=message=>{throw new AurevaError('INVALID_ASSET_DETAILS',message);};
 const ownership_type=String(form.get('ownership_type')||'UNKNOWN');
 if(!OWNERSHIP_TYPES.includes(ownership_type))fail('Choose an ownership type.');
 const result={ownership_type};
 for(const group of ASSET_GROUPS){
  const ids=form.getAll(`asset_${group}_person`),shares=form.getAll(`asset_${group}_share`);
  if(ids.length!==shares.length||ids.length>50)fail('Check the asset people and allocations.');
  const seen=new Set();let total=0;
  result[group]=ids.flatMap((id,index)=>{
   const share=String(shares[index]).trim();
   if(!id&&!share)return [];
   if(typeof id!=='string'||!people.some(p=>p.id===id)||seen.has(id))fail(`Choose each ${group} person once from your trusted people.`);
   seen.add(id);
   // Parse decimal digits directly, avoiding floating percentage arithmetic.
   if(share&&!/^\d{1,3}(?:\.\d{1,2})?$/.test(share))fail('Use percentages from 0 to 100 with at most two decimal places.');
   const [whole,fraction='']=share.split('.');
   const allocation_bps=share?Number(whole)*100+Number(fraction.padEnd(2,'0')):null;
   if(allocation_bps!==null&&(allocation_bps>10000||allocation_bps<0))fail('An allocation cannot exceed 100%.');
   total+=allocation_bps||0;
   return [{person_id:id,allocation_bps}];
  });
  if(total>10000)fail(`Total ${group} allocations cannot exceed 100%.`);
 }
 if(ownership_type==='SOLE'&&result.owners.length>1)fail('Sole ownership can have only one recorded owner.');
 const status=String(form.get('nomination_status')||'UNKNOWN');
 if(['OPTED_OUT','NOT_APPLICABLE'].includes(status)&&result.nominees.length)fail('Remove nominee entries or choose a nomination status that allows recorded nominees.');
 const evidence=String(form.get('nomination_evidence')||'').trim();
 if(evidence.length>2000)fail('Keep nomination evidence notes within 2,000 characters.');
 result.nomination_evidence=evidence;
 return result;
}
