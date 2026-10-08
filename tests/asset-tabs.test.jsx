import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import AssetDetailTabs from '../src/components/records/AssetDetailTabs';
it('supports keyboard tabs and resolves connected documents and people',()=>{
 const open=vi.fn();
 render(<AssetDetailTabs onOpenRecord={open} record={{id:'a',title:'Residence',revision:2}} payload={{continuity_details:{kind:'ASSET',asset:{documents:['d'],owners:[{person_id:'p',allocation_bps:10000}]}}}} records={[{id:'d',title:'Deed'}]} people={[{id:'p',display_name:'Owner'}]} files={[]} onDownload={()=>{}}/>);
 fireEvent.click(screen.getByRole('tab',{name:'Documents'}));
 expect(screen.getByRole('link',{name:'Open record'}).getAttribute('href')).toBe('/app/vault/d');
 fireEvent.click(screen.getByRole('link',{name:'Open record'}));
 expect(open).toHaveBeenCalledWith('d');
 fireEvent.keyDown(screen.getByRole('tab',{name:'Documents'}),{key:'End'});
 expect(screen.getByRole('tabpanel').textContent).toContain('Revision 2');
 fireEvent.click(screen.getByRole('tab',{name:'People'}));
 expect(screen.getByRole('tabpanel').textContent).toContain('Owner — 100.00%');
});
