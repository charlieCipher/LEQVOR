import {AurevaError} from '../security/safeEvents';
export function readProfessionalDetails(form){
 const value=name=>String(form.get('professional_'+name)||'').trim();
 const organization=value('organization'),country=value('country').toUpperCase(),region=value('region'),status=value('status')||'UNKNOWN';
 if(organization.length>160||region.length>120||(country&&!/^[A-Z]{2}$/.test(country))||!['UNKNOWN','ACTIVE','FORMER'].includes(status))throw new AurevaError('INVALID_PROFESSIONAL_DETAILS','Check the professional organization, country, region and relationship status.');
 if(!organization&&!country&&!region&&status==='UNKNOWN')return null;
 return {version:1,organization,country,region,status,verification_status:'UNVERIFIED'};
}
