import { useEffect, useRef, useState } from "react";
import { useVault } from "../../features/vault/VaultContext";
import { Button } from "../ui/Primitives";
import { safeFailure } from "../../modules/security/safeEvents";
import {PERSON_ROLES} from '../../modules/continuity/recordDetails';
import {readProfessionalDetails} from '../../modules/continuity/professionalDetails';
export default function TrustedPersonForm({ onSaved,person=null }) {
  const v = useVault(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false), active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  return (
    <form
      className="stack-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending.current) return;
        const element = e.currentTarget;
        const form = new FormData(element);
        const name = String(form.get('name') || '').trim();
        const relationship = String(form.get('relationship') || '').trim();
        for (const [field, value, label] of [['name', name, 'name'], ['relationship', relationship, 'relationship or professional role']]) {
          if (!value || value.length > 120) {
            setError(`Enter a ${label} between 1 and 120 characters.`);
            element.elements[field].focus();
            return;
          }
        }
        pending.current = true;
        setBusy(true);
        setError("");
        try {
          const card=String(form.get('recipient_card') || '').trim();
          const fingerprint=String(form.get('fingerprint') || '').trim();
          if ((card || fingerprint) && form.get('confirmed') !== 'on') {
            setError('Confirm the account identifier and fingerprint with this person through a separate trusted channel.');
            return;
          }
          const details={
              display_name: name,
              relationship,
              professional: form.get("professional") === "on",
              professional_details: readProfessionalDetails(form),
              roles:form.getAll('roles').filter(role=>PERSON_ROLES.includes(role)),
              reviewed_at: new Date().toISOString(),
            };
          const saved=person?await v.service.updatePerson(person,details):await v.service.addPerson(details,card || fingerprint ? {card,fingerprint} : undefined);
          if (active.current) {
            element.reset();
            onSaved(saved);
          }
        } catch (e) {
          if (active.current) setError(safeFailure(e));
        } finally {
          pending.current = false;
          for (const name of [...form.keys()]) form.delete(name);
          if (active.current) setBusy(false);
        }
      }}
    >
      <h2>{person?'Edit trusted contact':'Add to your trusted circle'}</h2>
      <label>
        Name
        <input name="name" required maxLength={120} defaultValue={person?.display_name||''}/>
      </label>
      <label>
        Relationship or professional role
        <input name="relationship" required maxLength={120} defaultValue={person?.relationship||''}/>
      </label>
      <label className="checkbox-label">
        <input type="checkbox" name="professional" defaultChecked={person?.professional||false}/>
        Professional contact
      </label>
      <fieldset><legend>Roles (choose any that apply)</legend>{PERSON_ROLES.map(role=><label className="checkbox-label" key={role}><input type="checkbox" name="roles" value={role} defaultChecked={person?.roles?.includes(role)||false}/>{role}</label>)}</fieldset>
      <details><summary>Professional relationship details (optional)</summary>
        <label>Organization<input name="professional_organization" maxLength={160} defaultValue={person?.professional_details?.organization||''}/></label>
        <label>Country code<input name="professional_country" maxLength={2} placeholder="IN" defaultValue={person?.professional_details?.country||''}/></label>
        <label>State or region<input name="professional_region" maxLength={120} defaultValue={person?.professional_details?.region||''}/></label>
        <label>Relationship status<select name="professional_status" defaultValue={person?.professional_details?.status||'UNKNOWN'}><option value="UNKNOWN">Not recorded</option><option value="ACTIVE">Active</option><option value="FORMER">Former</option></select></label>
        <p className="field-hint">Encrypted contact context only. This does not verify qualifications or authorize access.</p>
      </details>
      <p className="muted">
        Names and relationships are encrypted. Adding a person does not send an
        invitation or grant access.
      </p>
      {!person&&<details><summary>Verify a recipient key (optional)</summary>
        <p className="field-hint">Ask this person for their public sharing card from People. Confirm their account identifier and fingerprint separately, in person or on a trusted call. Saving a verified key does not send an invitation or grant access.</p>
        <label>Recipient public sharing card<textarea name="recipient_card" rows={4} maxLength={2048}/></label>
        <label>Independently confirmed fingerprint<input name="fingerprint" maxLength={43} autoComplete="off" spellCheck={false}/></label>
        <label className="checkbox-label"><input type="checkbox" name="confirmed"/>I independently confirmed this person's account identifier and fingerprint.</label>
      </details>}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" disabled={busy}>
        {busy ? "Encrypting…" : "Save trusted person"}
      </Button>
    </form>
  );
}
