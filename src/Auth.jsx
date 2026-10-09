import { useEffect, useId, useRef, useState } from "react";
import { supabaseConfig } from "./supabase";
import { AuthProvider } from "./lib/providers";
import { errorMessage } from "./shared/utils/errors";
import { Brand } from './components/ui/Primitives';
import Icon from "./components/Icon";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, validateNewPassword } from './lib/passwordPolicy';
export default function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [emailCooldown, setEmailCooldown] = useState(0);
  useEffect(() => {
    if (!emailCooldown) return;
    const timer = window.setTimeout(() => setEmailCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [emailCooldown]);
  const passwordHint = useId();
  const heading = useRef(null);
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    heading.current?.focus();
  }, [mode]);
  function changeMode(next) {
    if (busy) return;
    setMode(next);
    setNotice(null);
    setPassword("");
    setVisible(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (!AuthProvider.configured || busy) return;
    if ((mode === 'reset' || mode === 'confirm') && emailCooldown) return;
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "confirm") {
        await AuthProvider.resendConfirmation(email.trim(), window.location.origin);
        setEmailCooldown(60);
        setNotice({text: "Request accepted. If this account still needs confirmation, check your inbox and spam folder. Already confirmed? Sign in instead, or reset your password.", success: true});
      } else if (mode === "reset") {
        await AuthProvider.requestPasswordReset(email.trim(), window.location.origin);
        setEmailCooldown(60);
        setNotice({
          text: "If an account exists for this email, you’ll receive a password reset link shortly.",
          success: true,
        });
      } else if (mode === "signup") {
        validateNewPassword(password);
        await AuthProvider.signUp(email.trim(), password, name.trim(), window.location.origin);
        setPassword("");
        setNotice({
          text: "Request accepted. If your account needs confirmation, check your inbox and spam folder. If you already have an account, sign in or reset your password; another signup may not send an email.",
          success: true,
        });
      } else {
        await AuthProvider.signIn(email.trim(), password);
        setPassword("");
      }
    } catch (error) {
      setNotice({ text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  async function passkeySignIn(){
    if(busy||!AuthProvider.passkeysAvailable)return;
    setBusy(true);setNotice(null);
    try{await AuthProvider.signInWithPasskey();setPassword('');}
    catch(error){setNotice({text:errorMessage(error)});}
    finally{setBusy(false);}
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a href="/" className="brand">
          <Brand/>
        </a>
        <div className="auth-story-copy">
          
          <h1>
            A More Secure
            <br />
            Tomorrow
          </h1>
          <p>
            Protect what you’ve built.<br/>Preserve what matters.<br/>Give tomorrow more possibilities.
          </p>
          <div className="story-list">
            <div>
              <Icon name="vault" />
              <span>
                <strong>A place for the essentials</strong>
                <small>Documents, instructions, and important details.</small>
              </span>
            </div>
            <div>
              <Icon name="lock" />
              <span>
                <strong>Private by design</strong>
                <small>
                  Record details are encrypted before they leave your device.
                </small>
              </span>
            </div>
            <div>
              <Icon name="heart" />
              <span>
                <strong>More than paperwork</strong>
                <small>Preserve the words you want to pass on.</small>
              </span>
            </div>
          </div>
        </div>
        <div className="auth-footer"><blockquote>“The greatest wealth<br/>is a future they can call their own.”</blockquote><span>LEQVOR</span><i/></div>
      </section>
      <section className="auth-entry">
        <div className="auth-form-wrap">
          <span className="icon-tile">
            <Icon name="lock" />
          </span>
          
          <h2 ref={heading} tabIndex={-1}>
            {mode === "signup"
              ? "Make room for what matters."
              : mode === "reset"
                ? "Let’s get you back in."
                : mode === "confirm"
                  ? "Confirm your email."
                : <><span className="auth-welcome">Welcome to</span><Brand/></>}
          </h2>
          <p className="muted">
            {mode === "signup"
              ? "Create your account to start organizing your legacy."
              : mode === "reset"
                ? "We’ll email you a link to reset your account password."
                : mode === "confirm"
                  ? "Request a new link for an unconfirmed account."
                : "Your legacy is a story worth protecting."}
          </p>
          {!supabaseConfig.configured && (
            <div role="alert" className="notice">
              <strong>Your vault is not connected yet.</strong>
              <p>
                The account administrator needs to reconnect the vault before
                you can sign in. Your browser has not sent any credentials.
              </p>
            </div>
          )}
<form onSubmit={submit} className="stack-form">
            {mode === "signup" && (
              <label>
                Your name
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How should we address you?"
                />
              </label>
            )}
            <label>
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {(mode === "login" || mode === "signup") && (
              <label>
                Password
                <div className="password-field">
                  <input
                    required
                    type={visible ? "text" : "password"}
                    aria-label="Password"
                    aria-describedby={passwordHint}
                    minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === "signup"
                        ? "At least 16 characters"
                        : "Enter your password"
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                  >
                    <Icon name={visible ? "lock" : "eye"} />
                  </button>
                </div>
                <small id={passwordHint} className="field-hint">{mode === 'signup' ? PASSWORD_HINT : 'Enter your existing password. New passwords require at least 16 characters.'}</small>
              </label>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="text-button align-end"
                disabled={busy}
                onClick={() => changeMode("reset")}
              >
                Forgot password?
              </button>
            )}
            {notice && (
              <div
                role={notice.success ? "status" : "alert"}
                className={`notice ${notice.success ? "success" : ""}`}
              >
                {notice.text}
              </div>
            )}
            <button
              disabled={busy || !supabaseConfig.configured || ((mode === 'reset' || mode === 'confirm') && emailCooldown > 0)}
              className="primary"
            >
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? (emailCooldown ? `Try again in ${emailCooldown}s` : "Send reset link")
                    : mode === "confirm"
                      ? (emailCooldown ? `Try again in ${emailCooldown}s` : "Resend confirmation")
                    : "Sign in"}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="auth-legal">Limited beta · Read our <a href="/privacy">Interim Privacy Notice</a> and <a href="/terms">Terms of Use</a> before creating an account. Use sample or non-sensitive data.</p>
          {(mode === 'login' || mode === 'signup') && <button className="text-button" disabled={busy} onClick={() => changeMode('confirm')}>Need a confirmation email?</button>}
          {mode === "login" && <><p className="auth-divider">OR</p><button type="button" className="secondary passkey-button" disabled={busy||!AuthProvider.passkeysAvailable} onClick={passkeySignIn}><Icon name="fingerprint" size={32}/><span>Use Passkey / Biometric<small>{AuthProvider.passkeysAvailable?'Account sign-in · vault unlock stays separate':'Not enabled here · use your password'}</small></span><Icon name="arrow"/></button></>}
          <p className="auth-switch">
            {mode === "login" ? "New to LEQVOR?" : "Already have an account?"}{" "}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => changeMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <div className="auth-assurances">{[["lock","Encrypted & Secure"],["shield","Privacy First By Design"],["family","Built for Generations"]].map(([icon,text])=><div key={text}><Icon name={icon} size={25}/><span>{text}</span></div>)}</div><a className="preview-link" href="/app?preview=1">Explore sample workspace <Icon name="arrow" size={16}/></a><div className="auth-note">
            <Icon name="shield" />
            <p>
              Your account password signs you in. Your separate vault secret
              unlocks encrypted content.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
