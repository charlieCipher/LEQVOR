import { useEffect, useRef, useState } from "react";
import { VaultContext } from "./VaultContext";
import { VaultSession } from "../../modules/security/VaultSession";
import { V5VaultService } from "../../modules/vault/V5VaultService";
import {
  createVaultEnvelope,
  generateRecoverySecret,
  unlockVault,
  rewrapVaultPassword,
} from "../../modules/security/v5Crypto";
import { DatabaseProvider, AuthProvider } from "../../lib/providers";
import { safeFailure } from "../../modules/security/safeEvents";
import { Button, Card } from "../../components/ui/Primitives";
import SecureEntryFrame from '../../components/security/SecureEntryFrame';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from '../../lib/passwordPolicy';
export default function VaultGate({ session, children }) {
  const [vault, setVault] = useState(null),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [lockNotice, setLockNotice] = useState(""),
    [unlocked, setUnlocked] = useState(false),
    [busy, setBusy] = useState(false),
    [phrase, setPhrase] = useState(""),
    [recovery, setRecovery] = useState(false),
    [retry, setRetry] = useState(0);
  const controller = useRef(null),
    generation = useRef(0), unlockForm=useRef(null);
  if (!controller.current) controller.current = new VaultSession();
  useEffect(() => {
    let alive = true;
    DatabaseProvider.vault(session.user.id)
      .then((v) => {
        if (v && v.owner_id !== session.user.id) throw new Error('Vault owner mismatch.');
        if (alive) {
          setLoaded(true);
          setError('');
          setVault(v);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(safeFailure(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [session.user.id, retry]);
  useEffect(() => {
    const c = controller.current;
    // Keep the live counter; a numeric snapshot could restore an old generation.
    const operationGeneration = generation;
    const off = c.subscribe(() => {
      unlockForm.current?.reset();
      generation.current++;
      setUnlocked(false);
      setPhrase("");
    });
    const hidden = () => {
      if (document.visibilityState !== "visible") {
        setLockNotice("Your vault locked because the app moved to the background. Return here and unlock to continue.");
        generation.current++;
        c.lock();
      }
    };
    const blur = () => {
      setLockNotice("Your vault locked because this window lost focus. Unlock again when you are ready.");
      generation.current++;
      c.lock();
    };
    const touch = () => c.touch();
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      operationGeneration.current++;
      off();
      c.dispose();
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (busy || loading || !loaded) return;
    const form = new FormData(e.currentTarget),
      element = e.currentTarget,
      version = generation.current;
    setBusy(true);
    setError("");
    setLockNotice("");
    try {
      let current = vault;
      if (!current) {
        if (form.get("password") !== form.get("confirm"))
          throw new Error("Passwords do not match.");
        if (
          form.get("verify").trim().toLowerCase().replace(/\s+/g, " ") !==
          phrase
        )
          throw new Error("Recovery verification failed.");
        const row = await createVaultEnvelope(
          session.user.id,
          form.get("password"),
          phrase,
        );
        if (version !== generation.current) throw new Error("Session changed.");
        current = await DatabaseProvider.createVault({
          ...row,
          recovery_verified_at: new Date().toISOString(),
        });
        setVault(current);
      }
      let key = await unlockVault(
        current,
        recovery ? form.get("recovery") : form.get("password"),
        recovery,
      );
      if (recovery) {
        if (form.get("newPassword") !== form.get("newConfirm"))
          throw new Error("Passwords do not match.");
        const update = await rewrapVaultPassword(
          current,
          form.get("recovery"),
          form.get("newPassword"),
          true,
        );
        if (version !== generation.current) throw new Error("Session changed.");
        current = await DatabaseProvider.updateVault(current.id, update, current.wrapped_vmk_password.nonce);
        setVault(current);
      }
      if (version !== generation.current) {
        key = null;
        throw new Error("Session changed.");
      }
      element.reset();
      setPhrase("");
      controller.current.unlock(key);
      setUnlocked(true);
    } catch (e) {
      if (version !== generation.current) {
        setLockNotice("Unlock was cancelled because the secure session changed. Keep this window active and try again.");
        return;
      }
      setError(
        /Passwords do not match|Recovery verification failed/.test(e.message)
          ? e.message
          : safeFailure(e),
      );
    } finally {
      element.reset();
      for (const name of [...form.keys()]) form.delete(name);
      setBusy(false);
    }
  }
  if (unlocked && vault)
    return (
      <VaultContext.Provider
        value={{
          controller: controller.current,
          vault,
          service: new V5VaultService(controller.current, vault),
          lock: () => controller.current.lock(),
          purge: async () => {
            controller.current.lock();
            await AuthProvider.signOut();
          },
          setVault,
        }}
      >
        {children}
      </VaultContext.Provider>
    );
  return (
    <SecureEntryFrame>
      <Card>
        <p className="eyebrow">ACCOUNT AUTHENTICATED · VAULT LOCKED</p>
        <h1>
          {loading
            ? "Opening your vault…"
            : vault
              ? recovery
                ? "Recover your vault"
                : "Unlock your private vault"
              : "Create your private vault"}
        </h1>
        <p className="muted">
          Your account login and your vault secret protect different things.
          Only your vault secret can unlock your information.
        </p>
        {error && (
          <div className="notice" role="alert">
            {error}
            <Button
              onClick={() => {
                setError("");
                setLoading(true);
                setRetry((n) => n + 1);
              }}
            >
              Retry connection
            </Button>
          </div>
        )}
        {lockNotice && <p className="notice" role="status">{lockNotice}</p>}
        {!loading && loaded && (
          <form ref={unlockForm} className="stack-form" onSubmit={submit}>
            {recovery ? (
              <>
                <label>
                  24-word recovery secret
                  <textarea
                    required
                    name="recovery"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label>
                  New vault password
                  <input
                    type="password"
                    name="newPassword"
                    aria-label="New vault password"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                    autoComplete="new-password"
                  />
                  <small className="field-hint">{PASSWORD_HINT}</small>
                </label>
                <label>
                  Confirm new vault password
                  <input
                    type="password"
                    name="newConfirm"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : (
              <label>
                Vault password
                <input
                  type="password"
                  name="password"
                  aria-label="Vault password"
                  required
                  minLength={vault ? undefined : MIN_PASSWORD_LENGTH}
                  autoComplete={vault ? "current-password" : "new-password"}
                />
                {!vault && <small className="field-hint">{PASSWORD_HINT} Your recovery phrase contains 24 words and is separate.</small>}
              </label>
            )}
            {!vault && (
              <>
                <label>
                  Confirm vault password
                  <input
                    type="password"
                    name="confirm"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                </label>
                {!phrase ? (
                  <Button
                    onClick={() => setPhrase(generateRecoverySecret())}
                    type="button"
                  >
                    Generate recovery secret
                  </Button>
                ) : (
                  <>
                    <div className="recovery-words">
                      {phrase.split(" ").map((word, i) => (
                        <span key={i}>
                          <small>{i + 1}</small>
                          {word}
                        </span>
                      ))}
                    </div>
                    <p className="muted">
                      Write all 24 words down in order and keep them offline.
                      Anyone with these words and your encrypted vault can
                      recover it.
                    </p>
                    <label>
                      Verify all 24 words
                      <textarea
                        name="verify"
                        required
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Enter the words from your saved copy"
                      />
                    </label>
                  </>
                )}
              </>
            )}
            <Button variant="primary" disabled={busy || (!vault && !phrase)}>
              {busy
                ? "Working securely…"
                : vault
                  ? recovery
                    ? "Recover & replace vault password"
                    : "Unlock vault"
                  : "Verify recovery & create vault"}
            </Button>
          </form>
        )}
        {vault && (
          <Button
            disabled={busy}
            onClick={() => {
              unlockForm.current?.reset();
              setRecovery(!recovery);
              setError("");
            }}
          >
            {recovery ? "Use vault password" : "Recover using 24 words"}
          </Button>
        )}
        <Button
          title="Sign out of this account and return to the sign-in form"
          onClick={() =>
            AuthProvider.signOut().catch((e) => setError(safeFailure(e)))
          }
        >
          Back to sign in
        </Button>
      </Card>
    </SecureEntryFrame>
  );
}
