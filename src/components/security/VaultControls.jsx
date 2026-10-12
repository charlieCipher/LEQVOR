import { useState } from "react";
import { useVault } from "../../features/vault/VaultContext";
import {
  unlockVault,
  rewrapVaultPassword,
} from "../../modules/security/v5Crypto";
import { DatabaseProvider } from "../../lib/providers";
import { safeFailure } from "../../modules/security/safeEvents";
import { Button, Card } from "../ui/Primitives";
import SecureAction from './SecureAction';
import {MIN_PASSWORD_LENGTH} from '../../lib/passwordPolicy';
export default function VaultControls() {
  const v = useVault(),
    [action, setAction] = useState(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  if (!v) return null;
  return (
    <Card className="security-section">
      <h2>Vault & Recovery Controls</h2>
      <div className="setting-row">
        <span>
          <strong>Inactivity Cold Lock</strong>
          <small>Clears keys, metadata, and local search.</small>
        </span>
        <select
          aria-label="Inactivity Cold Lock"
          value={v.controller.timeout}
          onChange={(e) => {
            v.controller.configureTimeout(Number(e.target.value));
            setNotice("Inactivity timeout updated for this session.");
          }}
        >
          <option value={60000}>1 minute</option>
          <option value={300000}>5 minutes</option>
          <option value={600000}>10 minutes</option>
        </select>
      </div>
      <div className="form-actions">
        <Button onClick={v.lock}>Lock Vault</Button>
        <Button
          onClick={() => v.purge().catch((e) => setNotice(safeFailure(e)))}
        >
          Lock & Purge
        </Button>
        <Button
          onClick={() => {
            setAction("practice");
            setNotice("");
          }}
        >
          Practice Recovery
        </Button>
        <Button
          onClick={() => {
            setAction("password-auth");
            setNotice("");
          }}
        >
          Change vault password
        </Button>
      </div>
      {action==='password-auth'?<SecureAction title="Verify account before changing vault password" onVerified={async()=>setAction('password')}/>:action && (
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setNotice("");
            const f = new FormData(e.currentTarget),
              element = e.currentTarget;
            try {
              if (action === "practice") {
                await unlockVault(v.vault, f.get("phrase"), true);
                setNotice(
                  "Recovery verified. No production records were modified.",
                );
              } else {
                if (f.get("next") !== f.get("confirm")) {
                  setNotice("Passwords do not match.");
                  return;
                }
                const row = await v.controller.run(async(_key,active)=>{
                const update = await rewrapVaultPassword(
                  v.vault,
                  f.get("current"),
                  f.get("next"),
                );
                active();
                const updated = await DatabaseProvider.updateVault(
                  v.vault.id,
                  update,
                  v.vault.wrapped_vmk_password.nonce,
                );
                active();return updated;
                });
                v.setVault(row);
                setNotice(
                  "Vault password changed without re-encrypting records.",
                );
              }
              element.reset();
              setAction(null);
            } catch (e) {
              setNotice(safeFailure(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>
            {action === "practice"
              ? "Practice Recovery"
              : "Replace vault password"}
          </h3>
          {action === "practice" ? (
            <label>
              24-word recovery secret
              <textarea
                name="phrase"
                required
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          ) : (
            <>
              {[
                ["current", "Current vault password"],
                ["next", "New vault password"],
                ["confirm", "Confirm new vault password"],
              ].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input
                    required
                    type="password"
                    name={name}
                    minLength={name==='current'?undefined:MIN_PASSWORD_LENGTH}
                    autoComplete="off"
                  />
                </label>
              ))}
            </>
          )}
          <Button variant="primary" disabled={busy}>
            {busy ? "Verifying…" : "Verify securely"}
          </Button>
        </form>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
    </Card>
  );
}
