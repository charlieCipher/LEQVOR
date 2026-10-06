export const REQUIRED_FIELDS = Object.freeze(['context', 'institution', 'original_location', 'professional', 'trusted_person', 'instructions']);
export const FIELD_LABELS = Object.freeze({context:'Why this record matters',institution:'Institution or provider',original_location:'Location of the original',professional:'Professional contact',trusted_person:'Person who should know',instructions:'Next-step instructions'});
export function completeness(payload) { return Object.fromEntries(REQUIRED_FIELDS.map(field=>[field,Boolean(String(payload[field==='context'?'description':field]||'').trim())])); }
// Date-only reminders use the user's local calendar, avoiding a day shift west of UTC.
export function reviewDate(value) {
 if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return null;
 const date = new Date(`${value}T00:00:00`);
 const [year, month, day] = value.split('-').map(Number);
 return Number.isFinite(date.getTime()) && date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? date : null;
}
export function needsReview(record,now=Date.now()) {
 const selected = reviewDate(record.next_review_date);
 if (selected) return selected.getTime() <= now;
 const reviewed=Date.parse(record.reviewed_at);
 return !Number.isFinite(reviewed)||reviewed>now||now-reviewed>=365*86400000;
}
export function recordedSections(statements, sectionNames) {
 return sectionNames.flatMap((name,index)=>statements.some(item=>!item.archived&&item.kind==='statement'&&item.section===name)?[index]:[]);
}
export function reviewSchedule(records, now=Date.now()) {
 return records.filter(record=>!record.archived).map(record=>{
  const reviewed=Date.parse(record.reviewed_at);
  const valid=Number.isFinite(reviewed)&&reviewed<=now;
  const selected = reviewDate(record.next_review_date);
  return {id:record.id,title:record.title,due:needsReview(record,now),date:selected?selected.toISOString():valid?new Date(reviewed+365*86400000).toISOString():null};
 }).sort((a,b)=>Number(b.due)-Number(a.due)||(Date.parse(a.date)||0)-(Date.parse(b.date)||0));
}
// Seven equally weighted criteria per active record: its existence plus six
// continuity fields. Archived records/statements are excluded. Not a security score.
export function assessReadiness(records,now=Date.now()) {
 const active=records.filter(r=>!r.archived&&r.kind!=='statement');
 const gaps=active.flatMap(record=>REQUIRED_FIELDS.filter(f=>record.completeness?.[f]!==true).map(field=>({record_id:record.id,field})));
 const possible=active.length*7;
 return {percent:possible?Math.round(100*(possible-gaps.length)/possible):0,gaps,reviewDue:active.filter(r=>needsReview(r,now)).map(r=>r.id),formula:'v1: (documented record + six completed continuity fields) / seven criteria per active record'};
}
