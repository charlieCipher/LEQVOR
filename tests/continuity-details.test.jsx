import {afterEach,it,expect} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import ContinuityDetails from '../src/components/records/ContinuityDetails';
import {readRecordDetails} from '../src/modules/continuity/recordDetails';
afterEach(cleanup);
it('records unknown document state without treating a file as executed',()=>{
 render(<form><ContinuityDetails/></form>);
 fireEvent.change(screen.getByLabelText('Continuity type'),{target:{value:'DOCUMENT'}});
 const result=readRecordDetails(new FormData(screen.getByLabelText('Continuity type').closest('form')));
 expect(result.document).toEqual({existence:'UNKNOWN',execution_status:'UNKNOWN',physical_original:'UNKNOWN'});
});
it('preserves document status and jurisdiction on edit',()=>{
 render(<form><ContinuityDetails value={{kind:'DOCUMENT',document:{existence:'EXISTS',execution_status:'EXECUTED',physical_original:'YES'},jurisdiction:{country:'IN',state_or_region:'MH'},last_verified_date:'2026-09-14'}}/></form>);
 const result=readRecordDetails(new FormData(screen.getByLabelText('Continuity type').closest('form')));
 expect(result).toMatchObject({document:{execution_status:'EXECUTED'},jurisdiction:{country:'IN',state_or_region:'MH'},last_verified_date:'2026-09-14'});
});
it('rejects unsupported statuses and impossible dates',()=>{
 const f=new FormData();f.set('continuity_kind','ASSET');f.set('nomination_status','GUARANTEED');
 expect(()=>readRecordDetails(f)).toThrow();
 f.set('nomination_status','OPTED_OUT');f.set('details_verified','2026-02-30');
 expect(()=>readRecordDetails(f)).toThrow();
 f.set('details_verified','2026-02-28');
 expect(readRecordDetails(f).asset.nomination_status).toBe('OPTED_OUT');
});
