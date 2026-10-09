import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import TriggerReviews from '../src/components/people/TriggerReviews';
afterEach(cleanup);
function setup(){
 const request={id:'request',owner_id:'owner',reviewer_id:'reviewer',review_state:'PENDING',expires_at:'2027-01-01T00:00:00Z'};
 const service={vault:{owner_id:'reviewer'},session:{subscribe:()=>()=>{}},reviews:async()=>[request],manifests:async()=>[],revealReview:vi.fn(async()=>({instructions:'PRIVATE_REVIEW_CONTEXT'})),decide:vi.fn()};
 return {service,request};
}
it('requires deliberate reveal and clears the context and decision controls on focus loss',async()=>{
 const {service}=setup();render(<TriggerReviews service={service}/>);
 const button=await screen.findByRole('button',{name:'Reveal evidence context'});
 expect(service.revealReview).not.toHaveBeenCalled();expect(screen.queryByDisplayValue(/PRIVATE_REVIEW_CONTEXT/)).toBeNull();
 fireEvent.click(button);
 await waitFor(()=>expect(screen.getByLabelText('Revealed requirements and evidence').value).toContain('PRIVATE_REVIEW_CONTEXT'));
 fireEvent.blur(window);
 expect(screen.queryByLabelText('Revealed requirements and evidence')).toBeNull();
 expect(screen.queryByRole('button',{name:'Approve recorded context'})).toBeNull();expect(service.decide).not.toHaveBeenCalled();
});
it('suppresses a late decryption response after the context closes',async()=>{
 const {service}=setup();let finish;service.revealReview.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 render(<TriggerReviews service={service}/>);fireEvent.click(await screen.findByRole('button',{name:'Reveal evidence context'}));
 fireEvent.blur(window);finish({instructions:'PRIVATE_LATE_CONTEXT'});
 await waitFor(()=>expect(screen.queryByLabelText('Revealed requirements and evidence')).toBeNull());
 expect(service.decide).not.toHaveBeenCalled();
});
