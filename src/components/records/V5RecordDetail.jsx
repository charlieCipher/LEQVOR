import DocumentHistory from './DocumentHistory';
import {DocumentLinksView} from './DocumentFields';
import InsuranceFields from './InsuranceFields';
import ContinuityDetails, {ContinuityDetailsView} from './ContinuityDetails';
import AssetDetailTabs from './AssetDetailTabs';
import {readRecordDetails} from '../../modules/continuity/recordDetails';
import { readInsuranceForm } from '../../modules/insurance/continuity';
import { useState, useEffect, useRef } from "react";
import { useVault } from "../../features/vault/VaultContext";
import { safeFailure } from "../../modules/security/safeEvents";
import { Button, Card } from "../ui/Primitives";
import Icon from "../Icon";
import Modal from "../Modal";
import SecureAction from "../security/SecureAction";
import { reviewDate } from '../../modules/continuity/readiness';
export default function V5RecordDetail({ record, onChanged, onDeleted, records=[], people=[], onOpenRecord,onOpenPerson }) {
  const vault = useVault(),
    [payload, setPayload] = useState(null),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [conflict, setConflict] = useState(false);
  const active = useRef(true),
    saving = useRef(false),
    epoch = useRef(0);
  function handleFailure(error) {
    if (!active.current) return;
    if (error?.code === '40001') {
      epoch.current++;
      setPayload(null);
      setFiles([]);
      setEditing(false);
      setDeleting(false);
      setConflict(true);
    }
    setError(safeFailure(error));
  }
  useEffect(() => {
    // Capture the counter object, not its numeric value: cleanup invalidates
    // every operation started during this mounted lifetime.
    const operationEpoch = epoch;
    active.current = true;
    return () => {
      active.current = false;
      operationEpoch.current++;
    };
  }, []);
  useEffect(() => {
    if (!payload) return;
    const timer = setTimeout(() => {
      epoch.current++;
      setPayload(null);
      setFiles([]);
      setEditing(false);
    }, 30000);
    return () => clearTimeout(timer);
  }, [payload]);
  async function reveal() {
    const version = ++epoch.current;
    setBusy(true);
    setError("");
    try {
      const data = await vault.service.reveal(record);
      const documents = await vault.service.files(record);
      if (active.current && version === epoch.current) {
        setPayload(data);
        setFiles(documents);
      }
    } catch (e) {
      if (active.current) setError(safeFailure(e));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function download(file) {
    const version=epoch.current;
    setBusy(true);
    setError("");
    try {
      const data = await vault.service.download(file);
      if (!active.current || version!==epoch.current) {
        data.bytes.fill(0);
        return;
      }
      const blob = new Blob([data.bytes], { type: "application/octet-stream" });
      data.bytes.fill(0);
      const url = URL.createObjectURL(blob);
      vault.controller.trackURL(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.name || "attachment";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (active.current) setError(safeFailure(e));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    if (saving.current || busy || !payload) return;
    const f = new FormData(e.currentTarget);
    const title = String(f.get('title') || '').trim();
    if (!title || title.length > 160) {
      setError('Enter a title between 1 and 160 characters.');
      return;
    }
    const nextReviewDate = String(f.get('next_review_date') || '');
    if (nextReviewDate && !reviewDate(nextReviewDate)) {
      setError('Enter a valid next review date.');
      return;
    }
    const version = epoch.current;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const next = { ...payload };
      next.continuity_details=readRecordDetails(f,people,records.filter(r=>r.id!==record.id));
      for (const field of [
        "description",
        "institution",
        "reference",
        "original_location",
        "professional",
        "trusted_person",
        "instructions",
      ])
        next[field] = f.get(field);
      if(record.category === "Insurance") next.insurance=readInsuranceForm(f,records,people);
      await vault.service.update(
        record,
        {
          title,
          category: record.category,
          next_review_date: nextReviewDate || null,
          file_count: files.length,
        },
        next,
        f.get('asset_evidence'),
      );
      if (!active.current || version !== epoch.current) return;
      setPayload(null);
      setFiles([]);
      setEditing(false);
      onChanged?.();
    } catch (e) {
      if (version === epoch.current) handleFailure(e);
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <Card>
      {!payload ? (
        <div className="locked-content">
          <span className="lock-medallion">
            <Icon name="lock" size={30} />
          </span>
          <h2>Encrypted Information</h2>
          <p className="muted">Sensitive information hidden</p>
          <Button variant="primary" icon="eye" disabled={busy || conflict} onClick={reveal}>
            {busy ? "Revealing…" : "Reveal securely"}
          </Button>
          <p className="field-hint">
            Active vault session required · hides after 30 seconds
          </p>
        </div>
      ) : editing ? (
        <form className="stack-form" onSubmit={save}>
          <h2>Update continuity record</h2>
          {record.category === "Insurance" && <InsuranceFields value={payload.insurance} records={records} people={people}/>}
          <label>
            Title
            <input name="title" required maxLength={160} defaultValue={record.title} />
          </label>
          <label>
            Next review date (optional)
            <input type="date" name="next_review_date" defaultValue={reviewDate(record.next_review_date) ? record.next_review_date : ''} aria-describedby="review-date-help" />
          </label>
          <p id="review-date-help" className="field-hint">Leave empty for an annual review. This date is encrypted with your record and appears in Continuity; no email is sent. Saving changes does not confirm a review.</p>
          {[
            ["description", "Why it matters"],
            ["institution", "Institution"],
            ["reference", "Reference"],
            ["original_location", "Original location"],
            ["professional", "Professional contact"],
            ["trusted_person", "Who should know"],
            ["instructions", "What should happen next"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea name={key} defaultValue={payload[key] || ""} />
            </label>
          ))}
          <ContinuityDetails value={payload.continuity_details} people={people} records={records.filter(r=>r.id!==record.id)}/>
          {['ASSET','DOCUMENT','POLICY'].includes(payload.continuity_details?.kind)&&<label>Add encrypted evidence (up to 10 MB)<input name="asset_evidence" type="file"/></label>}
          <Button variant="primary" disabled={busy}>
            {busy ? 'Saving encrypted changes…' : 'Save encrypted changes'}
          </Button>
          <Button type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel editing</Button>
        </form>
      ) : (
        <div className="revealed-record">
          <div className="panel-heading">
            <h2>Continuity Information</h2>
            <Button
              onClick={() => {
                epoch.current++;
                setPayload(null);
                setFiles([]);
              }}
            >
              Hide
            </Button>
          </div>
          {[
            ["description", "Why it matters"],
            ["institution", "Institution"],
            ["reference", "Reference"],
            ["original_location", "Where is the original?"],
            ["professional", "Professional contact"],
            ["trusted_person", "Who should know?"],
            ["instructions", "What should happen next?"],
          ].map(([key, label]) => (
            <div className="private-field" key={key}>
              <h3>{label}</h3>
              <p>{payload[key] || "Not added yet"}</p>
            </div>
          ))}
          {record.category === "Insurance" && <div className="insurance-private-details"><h2>Policy details</h2>{[["Policy type",payload.insurance?.policy_type],["Recorded status",payload.insurance?.policy_status],["Renewal date",payload.insurance?.renewal_date],["Claim instructions",payload.insurance?.claim_instructions]].map(([label,value])=><div className="private-field" key={label}><h3>{label}</h3><p>{value||"Not recorded"}</p></div>)}</div>}
          <ContinuityDetailsView value={payload.continuity_details} people={people}/>
          {payload.continuity_details?.kind==='ASSET'&&<AssetDetailTabs record={record} payload={payload} records={records} people={people} files={files} busy={busy} onDownload={download} onOpenRecord={onOpenRecord} onOpenPerson={onOpenPerson}/>}
          {payload.continuity_details?.kind==='DOCUMENT'&&<><DocumentLinksView value={payload.continuity_details.document} people={people} records={records} onOpenRecord={onOpenRecord} onOpenPerson={onOpenPerson}/><DocumentHistory record={record} service={vault.service} people={people} records={records} onDownload={download}/></>}
          <div className="form-actions">
            <Button disabled={busy} onClick={() => setEditing(true)}>
              Edit record
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);setError('');
                try { await vault.service.update(
                  record,
                  {
                    title: record.title,
                    category: record.category,
                    reviewed_at: new Date().toISOString(),
                    next_review_date: null,
                    file_count: files.length,
                  },
                  payload,
                );
                onChanged?.();
                }catch(error){handleFailure(error);}finally{setBusy(false);}
              }}
            >
              Confirm still current
            </Button>
            <Button onClick={() => setDeleting(true)}>Delete record</Button>
          </div>
          <p className="field-hint">Confirming starts a new annual review period and clears any custom review date.</p>
          {files.map((file, i) => (
            <Button
              key={file.id}
              disabled={busy}
              onClick={() => download(file)}
              icon="download"
            >
              Download document {i + 1}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {conflict && <Button onClick={() => onChanged?.()}>Reload latest record</Button>}
      {deleting && (
        <Modal title="Confirm record deletion" onClose={() => setDeleting(false)}>
          <SecureAction
            title="Permanently delete this record and its files"
            onVerified={async () => {
              try {
                await vault.service.remove(record);
                setDeleting(false);
                onDeleted?.();
              } catch (error) {
                handleFailure(error);
                if (error?.code !== '40001') throw error;
              }
            }}
          />
        </Modal>
      )}
    </Card>
  );
}

