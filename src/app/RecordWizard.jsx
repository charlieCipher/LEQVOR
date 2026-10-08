import InsuranceFields from '../components/records/InsuranceFields';
import ContinuityDetails from '../components/records/ContinuityDetails';
import {readRecordDetails} from '../modules/continuity/recordDetails';
import { readInsuranceForm, insuranceIndex } from '../modules/insurance/continuity';
import { completeness } from "../modules/continuity/readiness";
import { useEffect, useRef, useState } from "react";
import { MAX_DOCUMENT_BYTES } from '../modules/security/v5Crypto';
import { Button } from "../components/ui/Primitives";
import { useVault } from "../features/vault/VaultContext";
import { safeFailure } from "../modules/security/safeEvents";
const steps = [
  "Record Type",
  "Information",
  "Documents",
  "Trusted Access",
  "Review & Encrypt",
];
export default function RecordWizard({ demo, onCancel, onSaved, records=[], people=[], initialCategory="Property" }) {
  const vault = useVault(),
    [step, setStep] = useState(0),
    [category, setCategory] = useState(initialCategory),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const form = useRef(null);
  const previousStep = useRef(step);
  const invalidField = useRef(null);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const target = invalidField.current || form.current.querySelector(`fieldset[data-step="${step}"] h2`);
    invalidField.current = null;
    target?.focus();
  }, [step]);
  const pending = useRef(false), active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  function validateStep(index) {
    if (index === 0 && !form.current.elements.title.value.trim()) {
      setError('Enter a record title that is not blank.');
      invalidField.current = form.current.elements.title;
      if (index === step) { invalidField.current.focus(); invalidField.current = null; }
      return false;
    }
    if (index === 2 && form.current.elements.attachment.files?.[0]?.size > MAX_DOCUMENT_BYTES) {
      setError('Choose a document no larger than 10 MB.');
      invalidField.current = form.current.elements.attachment;
      if (index === step) { invalidField.current.focus(); invalidField.current = null; }
      return false;
    }
    return true;
  }
  function next() {
    setError('');
    if (!validateStep(step)) return;
    const inputs = form.current.querySelectorAll(
      `fieldset[data-step="${step}"] input,fieldset[data-step="${step}"] textarea,fieldset[data-step="${step}"] select`,
    );
    for (const input of inputs) if (!input.reportValidity()) return;
    setStep((s) => s + 1);
  }
  async function save(e) {
    e.preventDefault();
    if (step < 4) {
      next();
      return;
    }
    if (pending.current) return;
    for (const index of [0, 2]) {
      if (!validateStep(index)) { setStep(index); return; }
    }
    pending.current = true;
    const f = new FormData(form.current);
    setBusy(true);
    setError("");
    try {
      const metadata = {
        title: f.get("title").trim(),
        category,
        reviewed_at: new Date().toISOString(),
        file_count: !demo && f.get("attachment")?.size ? 1 : 0,
      };
      const payload = {
        description: f.get("context"),
        institution: f.get("institution"),
        reference: f.get("reference"),
        original_location: f.get("location"),
        professional: f.get("professional"),
        trusted_person: f.get("person"),
        instructions: f.get("instructions"),
        related_records: [],
        archived: false,
        continuity_details: readRecordDetails(f,people),
      };
      if(category === "Insurance") { payload.insurance=readInsuranceForm(f,records,people); metadata.insurance_index=insuranceIndex(payload,demo?0:metadata.file_count); }
      metadata.completeness = completeness(payload);
      if (demo) {
        onSaved({
          id: crypto.randomUUID(),
          ...metadata,
          demo: true,
          files: 0,
          status: "In progress",
          updated: "just now",
        });
      } else {
        const saved = await vault.service.create(metadata, payload, f.get("attachment"));
        if (active.current) onSaved(saved);
      }
    } catch (e) {
      if (active.current) setError(safeFailure(e));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <form ref={form} className="stack-form" onSubmit={save} noValidate>
      <ol className="wizard-steps">
        {steps.map((label, i) => (
          <li
            key={label}
            className={step === i ? "active" : ""}
            aria-current={step === i ? "step" : undefined}
          >
            <strong>{i + 1}</strong>
            {label}
          </li>
        ))}
      </ol>
      {demo && (
        <p className="notice">
          Sample workspace: use fictional information only. No file is uploaded
          and no private payload is saved.
        </p>
      )}
      <fieldset data-step="0" hidden={step !== 0}>
        <h2 tabIndex={-1}>What are you protecting?</h2>
        <label>
          Record type
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "Personal",
              "Financial",
              "Property",
              "Insurance",
              "Legal",
              "Other",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Record title
          <input
            name="title"
            required
            maxLength={160}
            placeholder={
              category === "Insurance"
                ? "e.g. Term life insurance"
                : "e.g. Family property deed"
            }
          />
        </label>
        <p className="field-hint">
          The title is encrypted with your record and searchable only while your
          vault is unlocked.
        </p>
      </fieldset>
      <fieldset data-step="1" hidden={step !== 1}>
        <h2 tabIndex={-1}>Make this record understandable.</h2>
        {category === "Insurance" && <InsuranceFields records={records} people={people}/>}
        <label>
          Why does it matter?
          <textarea name="context" rows={3} />
        </label>
        <div className="form-pair">
          <label>
            {category === "Insurance" ? "Insurance provider" : "Institution"}
            <input name="institution" />
          </label>
          <label>
            {category === "Insurance"
              ? "Policy / reference number"
              : "Reference number"}
            <input name="reference" autoComplete="off" />
          </label>
        </div>
        <label>
          Where is the original?
          <input name="location" placeholder="Physical location or custodian" />
        </label>
        <label>
          {category === "Insurance" ? "Continuity instructions" : "What should happen next?"}
          <textarea name="instructions" rows={3} />
        </label>
        <label>
          Professional contact
          <input
            name="professional"
            placeholder="Lawyer, CA, adviser, or agent"
          />
        </label>
      </fieldset>
      <fieldset data-step="2" hidden={step !== 2}>
        <h2 tabIndex={-1}>Keep the evidence together.</h2>
        <ContinuityDetails people={people}/>
        <label>
          Supporting document
          <input name="attachment" type="file" />
        </label>
        <p className="muted">
          Optional · up to 10 MB. Documents and filenames are encrypted on this
          device before upload. Uploaded files are never executed as page
          content.
        </p>
      </fieldset>
      <fieldset data-step="3" hidden={step !== 3}>
        <h2 tabIndex={-1}>Who needs to know?</h2>
        <label>
          Trusted person or nominee
          <input name="person" placeholder="Name and useful context" />
        </label>
        <p className="muted">
          This encrypted note records your intent. It does not grant access or
          send an invitation. Cryptographic grants require a verified recipient
          and a sharing key.
        </p>
      </fieldset>
      <fieldset data-step="4" hidden={step !== 4}>
        <h2 tabIndex={-1}>Review & Encrypt</h2>
        <p className="muted">
          Your record will answer what exists, why it matters, where the
          original is, who should know, and what should happen next.
        </p>
        <div className="setting-row">
          <span>Record type</span>
          <strong>{category}</strong>
        </div>
        <div className="setting-row">
          <span>Access</span>
          <strong>Owner only</strong>
        </div>
        <div className="setting-row">
          <span>Protection</span>
          <strong>
            {demo ? "Sample record" : "Unique record key · AES-256-GCM"}
          </strong>
        </div>
      </fieldset>
      {error && (
        <div role="alert" className="notice">
          {error}
        </div>
      )}
      <div className="form-actions">
        <Button
          type="button"
          disabled={busy}
          onClick={() => (step ? setStep((s) => s - 1) : onCancel())}
        >
          {step ? "Back" : "Cancel"}
        </Button>
        <Button variant="primary" disabled={busy}>
          {busy
            ? "Encrypting and saving…"
            : step === 4
              ? demo
                ? "Save sample record"
                : "Save encrypted record"
              : "Continue"}
        </Button>
      </div>
    </form>
  );
}
