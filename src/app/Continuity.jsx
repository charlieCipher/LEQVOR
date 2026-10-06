import { insurancePolicies, claimReadiness } from '../modules/insurance/continuity';
import { useVault } from "../features/vault/VaultContext";
import StatementForm from "../components/continuity/StatementForm";
import V5RecordDetail from "../components/records/V5RecordDetail";
import { useState } from "react";
import Icon from "../components/Icon";
import { Button, Card, Progress, Heading } from "../components/ui/Primitives";
import Modal from "../components/Modal";
import LegacyForm from "../components/LegacyForm";
import RecordDetail from "../components/RecordDetail";
import { recordedSections, reviewSchedule } from '../modules/continuity/readiness';
const sections = [
  ["Final wishes", "Your intentions, in your own words.", "heart"],
  ["Family letters", "Words for the people who matter most.", "letter"],
  [
    "Emergency steps",
    "A clear starting point in a difficult moment.",
    "shield",
  ],
  [
    "Important contacts",
    "The right professional, when they need one.",
    "family",
  ],
  ["Legal records", "Keep executed documents within reach.", "file"],
  [
    "Distribution instructions",
    "Organize what you hope to pass on.",
    "archive",
  ],
];
export default function Continuity({
  pct,
  demo,
  letters,
  setLetters,
  session,
  go,
  records=[],
  people,
}) {
  const vault = useVault();
  const [step, setStep] = useState(3),
    [editing, setEditing] = useState(null),
    [letter, setLetter] = useState(null),
    [showReviews, setShowReviews] = useState(false),
    [sampleDone, setDone] = useState(demo ? [0, 2, 3, 4, 5] : []);
  const done = demo ? sampleDone : recordedSections(letters, sections.map(([name])=>name));
  const progress = Math.round((done.length / 6) * 100);
  const reviews = reviewSchedule([...new Map([...records,...letters].map(record=>[record.id,record])).values()]);
  return (
    <>
      <Heading
        eyebrow="CLARITY TODAY. CONTINUITY TOMORROW."
        title="Continuity Plan"
        text="Turn your intentions into a lasting plan."
      />
      <div className="continuity-layout">
        <aside className="journey">
          {[
            "Foundation",
            "People & Access",
            "Assets & Records",
            "Continuity Plan",
            "Review & Finalize",
            "Continuity Active",
          ].map((s, i) => (
            <button
              key={s}
              className={step === i ? "current" : ""}
              onClick={() => setStep(i)}
            >
              <span>
                {i < 3 && demo ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div>
                <strong>{s}</strong>
                <small>
                  {i < 3 && demo
                    ? "Completed"
                    : step === i
                      ? "You are here"
                      : "Next chapter"}
                </small>
              </div>
            </button>
          ))}
          <blockquote>
            “Peace of mind
            <br />
            comes from a plan.”<small>LEQVOR</small>
          </blockquote>
        </aside>
        <div className="plan-main">
          {step === 3 ? (
            <>
              <div className="section-label">
                <div><h2>Plan Sections</h2><p className="muted">Complete each section to create a comprehensive legacy plan.</p></div><div className="plan-inline-progress"><span>{done.length} of 6 sections</span><Progress value={progress}/><strong>{progress}%</strong></div>
              </div>
              <div className="plan-sections">
                {sections.map(([title, text, icon], i) => (
                  <button key={title} onClick={() => setEditing(title)}>
                    <span className="icon-tile">
                      <Icon name={icon} />
                    </span>
                    <div>
                      <h2>{title}</h2>
                      <p className="muted">{text}</p>
                      <span
                        className={
                          done.includes(i) ? "completion-label" : "muted"
                        }
                      >
                        <Icon
                          name={done.includes(i) ? "check" : "clock"}
                          size={13}
                        />{" "}
                        {done.includes(i)
                          ? demo ? "Completed · sample" : "Statement recorded"
                          : i === 1 && demo
                            ? "In progress"
                            : "Add your intentions"}
                      </span>
                    </div>
                    <span className="plan-section-detail">View Details <Icon name="chevron" size={13}/></span><aside className="plan-section-preview">{demo ? (i===0?<p>“I hope to be remembered for my kindness, curiosity, and the people I loved.”</p>:i===1?<p>A letter to my children…<br/><br/>Life will take you in many directions, but always remember that you are enough.</p>:<ul>{(i===2?['Medical care','Notify family','Secure property','Access accounts']:i===3?['Family (5)','Legal (3)','Financial (2)','Healthcare (3)']:i===4?['Last Will & Testament','Power of Attorney','Healthcare Directive']:['Personal Assets','Digital Assets','Heirlooms & Memorabilia','Charitable Giving']).map(t=><li key={t}><Icon name={i===2?'check':'file'} size={13}/>{t}</li>)}</ul>):<p><Icon name="lock" size={20}/><br/>Private instructions<br/>Open to add your intentions.</p>}</aside></button>
                ))}
              </div>
              {letters.map((l) => (
                <button
                  className="document-row"
                  key={l.id}
                  onClick={() => setLetter(l)}
                >
                  <Icon name="letter" />
                  {l.title}
                  <small>Personal letter</small>
                  <Icon name="lock" />
                </button>
              ))}
            </>
          ) : (
            <Card className="journey-chapter">
              <p className="eyebrow">CHAPTER {step + 1}</p>
              <h2>
                {
                  [
                    "A foundation for tomorrow.",
                    "Bring your people together.",
                    "Preserve the important pieces.",
                    "",
                    "Take a moment to review.",
                    "A plan that grows with you.",
                  ][step]
                }
              </h2>
              <p className="muted">
                {
                  [
                    "Start with what matters to you, and what you want your family to know.",
                    "Add trusted contacts and review permissions independently of relationships.",
                    "Organize your records and attach the documents that support them.",
                    "",
                    "Review your documents with the appropriate legal professional before relying on them.",
                    "Activation requires verified permissions and completed review. It is not enabled in this version.",
                  ][step]
                }
              </p>
              <Button
                variant="primary"
                onClick={() =>
                  step === 1
                    ? go("/app/people")
                    : step === 2
                      ? go("/app/vault")
                      : setStep(3)
                }
              >
                {step === 1
                  ? "Open trusted circle"
                  : step === 2
                    ? "Open asset library"
                    : "Review plan sections"}
              </Button>
            </Card>
          )}
          {insurancePolicies(records).length > 0 && <Card className="insurance-continuity"><h2>Insurance continuity</h2><p className="field-hint">Beneficiary information and instructions your family may need.</p>{insurancePolicies(records).map(r=><button className="document-row" key={r.id} onClick={()=>go("/app/vault/"+r.id)}><Icon name="shield"/><span>{r.title}<small>{claimReadiness(r,people).completed}/{claimReadiness(r,people).total} administrative items recorded · {claimReadiness(r,people).items.find(i=>i.key==="beneficiary").complete?"Beneficiary recorded":"Beneficiary not recorded"}</small></span><Icon name="chevron"/></button>)}</Card>}
          <div className="legal-note">
            <Icon name="info" size={18} />
            <p>
              LEQVOR organizes continuity information and evidence of intent. It
              does not replace a will, a lawyer, or a legally executed estate
              document. Distribution instructions are non-binding unless legally
              validated.
            </p>
          </div>
        </div>
        <aside className="plan-sidebar">
          <Card>
            <h2>Your Plan Progress</h2>
            <div
              className="progress-ring"
              style={{ "--progress": `${progress * 3.6}deg` }}
            >
              <span>
                {progress}
                <small>%</small>
              </span>
            </div>
            <h3>{demo ? "Almost there." : "One step at a time."}</h3>
            <p className="muted">
              A stronger tomorrow starts with the care you take today.
            </p>
            <Progress value={progress} />
            {!demo && <p className="field-hint">{done.length} of 6 sections have a saved statement. This tracks recorded intentions, not legal validity or access readiness. Asset information completeness: {pct}%.</p>}
          </Card>
          <Card>
            <h2>Completion Checklist</h2>
            {sections.map(([title], i) => (
              <button
                className="checklist-item"
                aria-label={`${title}: ${done.includes(i) ? demo ? 'Sample complete' : 'Statement recorded' : 'Not recorded'}`}
                key={title}
                onClick={() => setEditing(title)}
              >
                <Icon name={done.includes(i) ? "check" : "circle"} size={16} />
                {title}
              </button>
            ))}
          </Card>
          <Card>
            <h2>Upcoming Reviews</h2>
            {demo ? <div className="review-date">
              <span>
                OCT<strong>12</strong>
              </span>
              <p>
                Review legal records
                <small>
                  {demo ? "Sample reminder" : "Suggested quarterly review"}
                </small>
              </p>
            </div> : <>
              <p className="field-hint">{reviews.filter(review=>review.due).length} due for review. Custom dates take priority; otherwise reviews are annual. No email reminder is scheduled.</p>
              {reviews.length ? reviews.slice(0,3).map(review=><button key={review.id} className="document-row" onClick={()=>go('/app/vault/'+review.id)}><span>{review.title}<small>{review.due ? 'Review due' : 'Next review'}{review.date ? ` · ${new Date(review.date).toLocaleDateString()}` : ' · Review date not recorded'}</small></span><Icon name="chevron"/></button>) : <p className="muted">Save a record or statement to start your review schedule.</p>}
              {reviews.length > 3 && <Button onClick={()=>setShowReviews(true)}>View all {reviews.length} reviews</Button>}
            </>}
            <Button
              variant="primary"
              icon="arrow"
              onClick={() => {
                setStep(3);
                setEditing(sections.find((_,i)=>!done.includes(i))?.[0] || 'Final wishes');
              }}
            >
              {done.length === 6 ? 'Review Plan' : 'Continue Plan'}
            </Button>
          </Card>
        </aside>
      </div>
      {showReviews && (
        <Modal title="Record reviews" onClose={()=>setShowReviews(false)}>
          <p className="field-hint">Open a record, reveal it and confirm its information is still current. You can choose a custom next review date when editing.</p>
          {reviews.map(review=><button key={review.id} className="document-row" onClick={()=>{setShowReviews(false);go('/app/vault/'+review.id);}}><span>{review.title}<small>{review.due ? 'Review due' : 'Next review'}{review.date ? ` · ${new Date(review.date).toLocaleDateString()}` : ' · Review date not recorded'}</small></span><Icon name="chevron"/></button>)}
        </Modal>
      )}
      {editing && (
        <Modal title={editing} onClose={() => setEditing(null)}>
          {demo ? (
            <div className="stack-form">
              <p className="eyebrow">SAMPLE PLAN SECTION</p>
              <h2>{editing}</h2>
              <p className="muted">
                Explore this section with sample text only. Sign in to save
                encrypted statements.
              </p>
              <label>
                Your intentions
                <textarea
                  rows={6}
                  placeholder="What would you like your family to know?"
                />
              </label>
              <Button
                variant="primary"
                onClick={() => {
                  setDone((old) => [
                    ...new Set([
                      ...old,
                      sections.findIndex((s) => s[0] === editing),
                    ]),
                  ]);
                  setEditing(null);
                }}
              >
                Mark sample section complete
              </Button>
            </div>
          ) : vault ? (
            <StatementForm
              section={editing}
              onSaved={(l) => {
                setLetters((old) => [l, ...old]);
                setEditing(null);
              }}
            />
          ) : (
            <LegacyForm
              session={session}
              onCancel={() => setEditing(null)}
              onSaved={(l) => {
                setLetters((old) => [l, ...old]);
                setEditing(null);
              }}
            />
          )}
        </Modal>
      )}
      {letter && (
        <Modal title="Private family statement" onClose={() => setLetter(null)}>
          {letter.v5 ? (
            <V5RecordDetail record={letter} onDeleted={() => setLetter(null)} />
          ) : (
            <RecordDetail
              record={letter}
              legacy
              onLock={() => setLetter(null)}
            />
          )}
        </Modal>
      )}
    </>
  );
}
