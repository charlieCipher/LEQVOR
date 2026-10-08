import {AurevaError} from '../security/safeEvents';
export const DOCUMENT_LINKS=[['custodians','Custodians'],['professionals','Professionals'],['people','Related people'],['assets','Related assets']];
export function readDocumentLinks(form,people=[],records=[]){
 const out={};
 for(const [group] of DOCUMENT_LINKS){
  const ids=form.getAll(`document_${group}`).map(String);
  const available=group==='assets'?records.filter(r=>r.continuity_kind==='ASSET'):people;
  if(ids.length>30||new Set(ids).size!==ids.length||ids.some(id=>!available.some(item=>item.id===id)))throw new AurevaError('INVALID_DOCUMENT_LINK','Choose available people and assets for this document.');
  out[group]=ids;
 }
 return out;
}
