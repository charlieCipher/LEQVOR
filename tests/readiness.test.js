import {describe,it,expect} from 'vitest';
import {assessReadiness,completeness,continuityIndex,needsReview,recordedSections,reviewSchedule,reviewDate} from '../src/modules/continuity/readiness';
describe('documented continuity readiness',()=>{
 it('scores only active records and returns exact missing fields',()=>{const result=assessReadiness([{id:'a',completeness:{context:true,institution:true}},{id:'b',archived:true},{id:'c',kind:'statement'}]);expect(result.percent).toBe(43);expect(result.gaps.map(g=>g.field)).toEqual(['original_location','professional','trusted_person','instructions']);});
 it('uses explicit booleans rather than truthy imported data',()=>{expect(assessReadiness([{id:'a',completeness:{context:'yes'}}]).percent).toBe(14);expect(assessReadiness([]).percent).toBe(0);});
 it('flags missing, invalid, future, and expired review dates',()=>{const now=Date.parse('2026-09-11');for(const date of [undefined,'bad','2027-01-01','2025-01-01'])expect(needsReview({reviewed_at:date},now)).toBe(true);expect(needsReview({reviewed_at:'2026-08-01'},now)).toBe(false);});
 it('derives completeness without retaining private input',()=>{const result=completeness({description:'private',instructions:'   ',institution:'provider'});expect(result.context).toBe(true);expect(result.instructions).toBe(false);expect(JSON.stringify(result)).not.toContain('private');});
});
it('detects deleted links and expired reviews rather than accepting descriptions as relationships',()=>{
 const index=continuityIndex({continuity_details:{kind:'ASSET',jurisdiction:{country:'IN'},asset:{owners:[{person_id:'owner'}],beneficiaries:[{person_id:'deleted'}],documents:['missing']}}});
 const record={id:'home',continuity_index:index,completeness:completeness(Object.fromEntries(['description','institution','original_location','professional','trusted_person','instructions'].map(f=>[f,'recorded']))),reviewed_at:'2024-01-01'};
 const result=assessReadiness([record],Date.parse('2026-10-09'),[{id:'owner'}]);
 expect(result.gaps.map(g=>g.field)).toEqual(['review','linked_people','linked_records','beneficiary']);
 expect(result.percent).toBeLessThan(100);
 expect(JSON.stringify(index)).not.toContain(':"recorded"');
});

it('uses valid custom calendar dates and rejects rollover or malformed dates',()=>{
 const now=new Date(2026,9,6,12).getTime();
 for(const value of ['2026-02-30','2026-13-01','2026-10-06T00:00:00Z',{},''])expect(reviewDate(value)).toBeNull();
 expect(reviewDate('2028-02-29').getDate()).toBe(29);
 expect(needsReview({reviewed_at:'2020-01-01',next_review_date:'2026-10-07'},now)).toBe(false);
 expect(needsReview({reviewed_at:'2026-10-05',next_review_date:'2026-10-06'},now)).toBe(true);
 expect(needsReview({next_review_date:'invalid'},now)).toBe(true);
 const scheduled=reviewSchedule([{id:'custom',next_review_date:'2026-10-07'}],now)[0];
 expect(new Date(scheduled.date).getDate()).toBe(7);
 expect(scheduled.due).toBe(false);
});
it('marks an annual review due at its exact boundary',()=>{
 const reviewed=Date.parse('2025-10-06T12:00:00Z');
 expect(needsReview({reviewed_at:new Date(reviewed).toISOString()},reviewed+365*86400000)).toBe(true);
});

it('tracks only known sections with active saved statements',()=>{
 expect(recordedSections([{kind:'statement',section:'Wishes'},{kind:'statement',section:'Wishes'},{kind:'statement',section:'Letters',archived:true},{section:'Contacts'},{kind:'statement',section:'Unknown'}],['Wishes','Letters','Contacts'])).toEqual([0]);
});
it('orders real review suggestions without including archived records',()=>{
 const now=Date.parse('2026-09-21T00:00:00Z');
 const result=reviewSchedule([{id:'recent',title:'Recent',reviewed_at:'2026-09-01T00:00:00Z'},{id:'missing'},{id:'old',reviewed_at:'2024-01-01'},{id:'archived',archived:true}],now);
 expect(result.map(r=>r.id)).toEqual(['missing','old','recent']);
 expect(result[0]).toMatchObject({due:true,date:null});
 expect(result[2]).toMatchObject({due:false,date:'2027-09-01T00:00:00.000Z'});
});

