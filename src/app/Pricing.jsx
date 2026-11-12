// src/app/Pricing.jsx
import React from "react";

const C = {
  bg: "#0d1420",
  panel: "#121b2b",
  panelHi: "#16223a",
  line: "#243148",
  lineHi: "#8a7a52",
  text: "#e7eaf0",
  muted: "#97a3b8",
  accent: "#c9b27a",
  accentText: "#14110a",
};

const SERIF = "'Georgia', 'Times New Roman', serif";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const PLANS = [
  {
    id: "essential",
    name: "Essential",
    price: "₹999",
    audience: "Individuals, professionals and first-time continuity users.",
    includes: ["Full encryption", "AES-256-GCM protection", "Argon2id recovery security", "Recovery phrase system", "Trusted sessions", "Secure uploads", "Soft delete recovery", "Basic continuity organization", "Device alerts"],
    limits: ["2 GB storage", "2 trusted devices"],
  },
  {
    id: "continuity",
    name: "Continuity",
    price: "₹1,999",
    recommended: true,
    audience: "Founders, business owners, privacy-conscious and serious long-term users.",
    lead: "Everything in Essential, plus",
    includes: ["Better organization tools", "Priority support", "Continuity reminders", "Export tools", "More trusted devices"],
    limits: ["10 GB storage", "5 trusted devices"],
  },
  {
    id: "family",
    name: "Family",
    price: "₹3,999",
    audience: "Families, continuity planning and shared organization.",
    lead: "Everything in Continuity, plus",
    includes: ["Family member access", "Shared continuity organization", "Family continuity management", "Shared activity visibility"],
    limits: ["50 GB storage", "5 family members", "15 trusted devices"],
  },
  {
    id: "private",
    name: "Private",
    price: "₹7,999",
    audience: "HNIs, business families and high-touch private users.",
    lead: "Everything, plus",
    includes: ["Concierge onboarding", "Dedicated support", "Private migration assistance", "Priority operational response"],
    limits: ["150 GB storage", "30 trusted devices"],
  },
];

const css = `.lq-pricing *{box-sizing:border-box} .lq-btn{cursor:pointer;transition:background .15s ease,border-color .15s ease} .lq-btn:focus-visible{outline:2px solid ${C.accent};outline-offset:3px} .lq-btn-primary:hover{background:#d6c18f} .lq-btn-secondary:hover{border-color:${C.accent}} @media (prefers-reduced-motion:reduce){.lq-btn{transition:none}}`;

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ flex: "none", marginTop: 4 }}>
      <path d="M2.5 7.5l3 3 6-6.5" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({ plan, onStart }) {
  const hi = !!plan.recommended;
  return (
    <article aria-label={`LEQVOR ${plan.name}`} style={{ position: "relative", display: "flex", flexDirection: "column", background: hi ? C.panelHi : C.panel, border: `1px solid ${hi ? C.lineHi : C.line}`, borderRadius: 12, padding: "32px 28px 28px" }}>
      {hi && (
        <span style={{ position: "absolute", top: -11, left: 28, background: C.accent, color: C.accentText, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 4 }}>
          Recommended
        </span>
      )}
      <h3 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.text }}>{plan.name}</h3>
      <p style={{ margin: "14px 0 0", color: C.text }}>
        <span style={{ fontFamily: SERIF, fontSize: 38 }}>{plan.price}</span>
        <span style={{ color: C.muted, fontSize: 15 }}> / month</span>
      </p>
      <p style={{ margin: "12px 0 24px", color: C.muted, fontSize: 14, lineHeight: 1.55, minHeight: 44 }}>{plan.audience}</p>
      {plan.lead && <p style={{ margin: "0 0 10px", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: C.accent }}>{plan.lead}</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {plan.includes.map((f) => (
          <li key={f} style={{ display: "flex", gap: 10, color: C.text, fontSize: 14.5, lineHeight: 1.5, marginBottom: 8 }}>
            <Check /> <span>{f}</span>
          </li>
        ))}
      </ul>
      <ul style={{ listStyle: "none", margin: "20px 0 28px", padding: "16px 0 0", borderTop: `1px solid ${C.line}` }}>
        {plan.limits.map((l) => <li key={l} style={{ color: C.muted, fontSize: 14, marginBottom: 6 }}>{l}</li>)}
      </ul>
      <button type="button" onClick={() => onStart && onStart(plan.id)} className={`lq-btn ${hi ? "lq-btn-primary" : "lq-btn-secondary"}`} style={{ marginTop: "auto", width: "100%", padding: "13px 16px", fontFamily: SANS, fontSize: 15, fontWeight: 600, borderRadius: 8, background: hi ? C.accent : "transparent", color: hi ? C.accentText : C.text, border: `1px solid ${hi ? C.accent : C.line}` }}>
        Start 30-day private access
      </button>
    </article>
  );
}

export default function Pricing({ onStart }) {
  return (
    <main className="lq-pricing" style={{ background: C.bg, color: C.text, fontFamily: SANS, minHeight: "100vh", padding: "88px 20px 96px" }}>
      <style>{css}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ maxWidth: 720, margin: "0 auto 64px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: C.accent }}>LEQVOR</p>
          <h1 style={{ margin: "16px 0 18px", fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.15 }}>Private continuity infrastructure.</h1>
          <p style={{ margin: 0, color: C.muted, fontSize: 17, lineHeight: 1.65 }}>Every plan has the same security. Higher plans add capacity, family infrastructure and operational support.</p>
          <p style={{ display: "inline-block", margin: "28px 0 0", padding: "9px 16px", border: `1px solid ${C.line}`, borderRadius: 999, fontSize: 14, color: C.text }}>Every new account begins with 30 days of full private access.</p>
        </header>
        <section aria-label="Plans" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20, alignItems: "stretch" }}>
          {PLANS.map((p) => <PlanCard key={p.id} plan={p} onStart={onStart} />)}
        </section>
        <p style={{ textAlign: "center", color: C.muted, fontSize: 13.5, lineHeight: 1.6, margin: "24px auto 0", maxWidth: 640 }}>Billed monthly through Razorpay by UPI, debit or credit card, or net banking. Cancel at any time.</p>
        <section style={{ margin: "72px auto 0", maxWidth: 760, padding: "36px 32px", border: `1px solid ${C.line}`, borderRadius: 12, background: C.panel }}>
          <h2 style={{ margin: "0 0 12px", fontFamily: SERIF, fontWeight: 400, fontSize: 26 }}>The same security on every plan.</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 16, lineHeight: 1.7 }}>Every plan has the same encryption, the same recovery protection, the same session protection and the same security standards. A product people trust with their records should never make anyone feel less safe because of the plan they chose. Higher plans add continuity capacity, family infrastructure, operational support, and more storage and devices.</p>
        </section>
        <section style={{ margin: "40px auto 0", maxWidth: 760, padding: "0 4px" }}>
          <h2 style={{ margin: "0 0 10px", fontFamily: SERIF, fontWeight: 400, fontSize: 20 }}>If a subscription ends</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 15, lineHeight: 1.7 }}>Uploads, edits and exports are paused and your vault becomes read-only. For a retention window of 30 to 60 days you can reactivate at any time and regain full access. Before any inactive encrypted data is scheduled for deletion, we send you several reminders and recovery warnings.</p>
        </section>
      </div>
    </main>
  );
}