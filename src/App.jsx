import Trust from "./app/Trust";
import { publicTrustPaths } from "./app/trustContent";
import MfaGate from "./features/auth/MfaGate";
import { useEffect, useState } from "react";
import { AuthProvider } from "./lib/providers";
import Auth from "./Auth";
import Icon from "./components/Icon";
import ScreenBoundary from './components/ui/ScreenBoundary';
// Load the secure-entry and workspace code before users start recovery setup.
// A late chunk request after a deployment must not interrupt a saved vault.
import Workspace from './app/Workspace';
import VaultGate from './features/vault/VaultGate';
import { errorMessage } from "./shared/utils/errors";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from './lib/passwordPolicy';
export default function App() {
  return <ScreenBoundary><Application /></ScreenBoundary>;
}
function Application() {
  const [auth, setAuth] = useState({
    session: null,
    loading: AuthProvider.configured,
    recovery: false,
    error: "",
  });
  useEffect(() => {
    if (
      !AuthProvider.configured ||
      new URLSearchParams(window.location.search).get("preview") === "1" ||
      publicTrustPaths.includes(window.location.pathname)
    )
      return undefined;
    let alive = true;
    let authEventReceived = false;
    AuthProvider.session()
      .then((data) => {
        if (alive && !authEventReceived)
          setAuth({
            session: data?.session || null,
            loading: false,
            recovery: false,
            error: "",
          });
      })
      .catch((error) => {
        if (alive && !authEventReceived)
          setAuth({
            session: null,
            loading: false,
            recovery: false,
            error: errorMessage(error),
          });
      });
    const unsubscribe = AuthProvider.subscribe((event, session) => {
      authEventReceived = true;
      if (alive)
        setAuth((previous) => ({
          session,
          loading: false,
          recovery:
            event === "PASSWORD_RECOVERY" ||
            (event !== "SIGNED_OUT" && previous.recovery),
          error: "",
        }));
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  if (publicTrustPaths.includes(window.location.pathname)) return <Trust />;
  if (new URLSearchParams(window.location.search).get("preview") === "1")
    return <Workspace demo />;
  if (auth.loading)
    return (
      <main className="loading-page">
        <span className="spinner" />
        <p>Opening your vault…</p>
      </main>
    );
  if (auth.recovery && auth.session)
    return (
      <ResetPassword
        onDone={() => setAuth((value) => ({ ...value, recovery: false }))}
      />
    );
  if (!auth.session)
    return (
      <>
        {auth.error && (
          <div className="notice" role="alert">
            {auth.error}
          </div>
        )}
        <Auth />
      </>
    );
  return (
    <MfaGate key={auth.session.user.id}>
      <VaultGate session={auth.session}>
        <Workspace session={auth.session} />
      </VaultGate>
    </MfaGate>
  );
}

function ResetPassword({ onDone }) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm"))
      return setNotice("Passwords don’t match.");
    setBusy(true);
    try {
      await AuthProvider.updatePassword(form.get("password"));
      onDone();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="loading-page">
      <form className="panel stack-form reset-form" onSubmit={submit}>
        <h1>Set a new password</h1>
        <p className="muted">
          This changes your account password. Your vault secrets stay the same.
        </p>
        <label>
          New password
          <input
            required
            name="password"
            type="password"
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
          <small className="field-hint">{PASSWORD_HINT}</small>
        </label>
        <label>
          Confirm password
          <input
            required
            name="confirm"
            type="password"
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
        </label>
        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}
        <button disabled={busy} className="primary">
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </main>
  );
}
