import { useState } from 'react';
import { assessReadiness, FIELD_LABELS } from '../../modules/continuity/readiness';
import { Button, Card, Badge } from '../ui/Primitives';
import Icon from '../Icon';
import {useReviewClock} from '../../modules/continuity/useReviewClock';
export default function ContinuityGaps({ records, go, people=[] }) {
 const now=useReviewClock();
 const [expanded,setExpanded]=useState(false),assessment=assessReadiness(records,now,people);
 const ids=[...new Set(assessment.gaps.map(g=>g.record_id))],shown=expanded?ids:ids.slice(0,2);
 if(!records.length)return null;
 return <Card className="continuity-gaps"><div className="panel-heading"><div><p className="eyebrow">A CLEARER PATH FORWARD</p><h2>Continuity Gaps</h2></div><Badge tone={ids.length?'warning':'success'}>{ids.length?`${ids.length} records need attention`:'Core information complete'}</Badge></div>{ids.length?<div className="gap-records">{shown.map(id=>{const record=records.find(r=>r.id===id),gaps=assessment.gaps.filter(g=>g.record_id===id);return <div className="gap-record" key={id}><div><strong>{record.title}</strong><span className="muted">{record.category}</span></div><ul>{gaps.map(g=><li key={g.field}><Icon name="circle" size={13}/>{FIELD_LABELS[g.field]}</li>)}</ul><Button onClick={()=>go('/app/vault/'+id)} icon="arrow">Complete record</Button></div>;})}</div>:<p className="muted">Recorded continuity information, linked entities and review dates are complete. This does not establish entitlement or grant access.</p>}{ids.length>2&&<Button onClick={()=>setExpanded(!expanded)}>{expanded?'Show fewer records':`View all ${ids.length} records`}</Button>}{assessment.reviewDue.length>0&&<p className="freshness-note"><Icon name="clock" size={15}/>{assessment.reviewDue.length} records also need a freshness review.</p>}</Card>;
}

