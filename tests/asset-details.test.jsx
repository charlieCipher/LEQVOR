import {afterEach,it,expect} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import AssetPeopleFields from '../src/components/records/AssetPeopleFields';
import {readAssetDetails} from '../src/modules/continuity/assetDetails';
const people=[{id:'a',display_name:'Person A'},{id:'b',display_name:'Person B'}];
afterEach(cleanup);
function form(shares,ids=['a','b'],group='owners'){
 const f=new FormData();f.set('ownership_type','JOINT');
 ids.forEach((id,i)=>{f.append(`asset_${group}_person`,id);f.append(`asset_${group}_share`,shares[i]);});return f;
}
it('uses exact basis points and keeps unknown distinct from zero',()=>{
 expect(readAssetDetails(form(['33.33','66.67']),people).owners.map(r=>r.allocation_bps)).toEqual([3333,6667]);
 expect(readAssetDetails(form(['','0']),people).owners.map(r=>r.allocation_bps)).toEqual([null,0]);
});
it('rejects over-allocation, duplicates, unknown people and contradictory statuses',()=>{
 for(const f of [form(['50.01','50']),form(['1.001','2']),form(['50','50'],['a','a']),form(['50','50'],['a','foreign'])])expect(()=>readAssetDetails(f,people)).toThrow();
 const sole=form(['50','50']);sole.set('ownership_type','SOLE');expect(()=>readAssetDetails(sole,people)).toThrow();
 const opted=form(['100'],['a'],'nominees');opted.set('nomination_status','OPTED_OUT');expect(()=>readAssetDetails(opted,people)).toThrow();
});
it('edits linked people without duplicating contact details and preserves shares after removing a row',()=>{
 render(<form><AssetPeopleFields value={{ownership_type:'JOINT',owners:[{person_id:'a',allocation_bps:2500},{person_id:'b',allocation_bps:7500}]}} people={people}/></form>);
 fireEvent.click(screen.getByRole('button',{name:'Remove owners person 1'}));
 const result=readAssetDetails(new FormData(screen.getByLabelText('Ownership type').closest('form')),people);
 expect(result.owners).toEqual([{person_id:'b',allocation_bps:7500}]);
 expect(JSON.stringify(result)).not.toContain('Person B');
});
