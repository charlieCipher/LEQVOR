import {AurevaError} from '../security/safeEvents';
import {reviewDate} from './readiness';
import {readAssetDetails} from './assetDetails';
export const NOMINATION_STATUSES=['UNKNOWN','REGISTERED','OPTED_OUT','NEEDS_VERIFICATION','NOT_APPLICABLE'];
export const DOCUMENT_STATUSES=['UNKNOWN','DRAFT','EXECUTED','SUPERSEDED','REVOKED','EXPIRED'];
export const PERSON_ROLES=['Family','Beneficiary','Nominee','Executor','Lawyer','Chartered Accountant','Company Secretary','Financial Adviser','Wealth Manager','Other Professional'];
export function readRecordDetails(form,people=[],records=[]){
 const value=name=>String(form.get(name)||'').trim();
 const kind=value('continuity_kind')||'OTHER';
 const fail=()=>{throw new AurevaError('INVALID_CONTINUITY_DETAILS','Check the continuity type, status, jurisdiction and verification date.');};
 if(!['OTHER','ASSET','DOCUMENT','POLICY','INSTRUCTION'].includes(kind))fail();
 const country=value('jurisdiction_country').toUpperCase(),region=value('jurisdiction_region'),verified=value('details_verified');
 if((country&&!/^[A-Z]{2}$/.test(country))||region.length>120||(verified&&!reviewDate(verified)))fail();
 const details={version:1,kind,jurisdiction:{country,state_or_region:region},last_verified_date:verified||null};
 if(kind==='ASSET'){
  const nomination_status=value('nomination_status')||'UNKNOWN';
  if(!NOMINATION_STATUSES.includes(nomination_status))fail();
  details.asset={nomination_status,...readAssetDetails(form,people,records)};
 }
 if(kind==='DOCUMENT'){
  const execution_status=value('execution_status')||'UNKNOWN',existence=value('document_existence')||'UNKNOWN',original=value('physical_original')||'UNKNOWN';
  if(!DOCUMENT_STATUSES.includes(execution_status)||!['EXISTS','UNKNOWN'].includes(existence)||!['YES','NO','UNKNOWN'].includes(original))fail();
  details.document={execution_status,existence,physical_original:original};
 }
 return details;
}
