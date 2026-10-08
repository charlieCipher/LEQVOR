import {it,expect} from 'vitest';
import {readDocumentLinks} from '../src/modules/continuity/documentDetails';
it('accepts existing typed assets and people without copying profiles',()=>{const f=new FormData();f.append('document_assets','a');f.append('document_custodians','p');expect(readDocumentLinks(f,[{id:'p'}],[{id:'a',continuity_kind:'ASSET'}])).toEqual({assets:['a'],custodians:['p'],professionals:[],people:[]});});
it('rejects duplicate, unavailable and non-asset links',()=>{const f=new FormData();f.append('document_assets','d');expect(()=>readDocumentLinks(f,[],[{id:'d',continuity_kind:'DOCUMENT'}])).toThrow();const p=new FormData();p.append('document_people','p');p.append('document_people','p');expect(()=>readDocumentLinks(p,[{id:'p'}])).toThrow();});
