import { Helmet } from "react-helmet-async";
import Trust from "./app/Trust";
import { publicTrustPaths } from "./app/trustContent";
import MfaGate from "./features/auth/MfaGate";
import { useEffect, useState } from "react";
import { AuthProvider } from "./lib/providers";
import Auth from "./Auth";
import ScreenBoundary from "./components/ui/ScreenBoundary";
// Load the secure-entry and workspace code before users start recovery setup.
// A late chunk request after a deployment must not interrupt a saved vault.
import Workspace from "./app/Workspace";
import VaultGate from "./features/vault/VaultGate";
import { errorMessage } from "./shared/utils/errors";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from "./lib/passwordPolicy";

export default function App() {
  return (
    <ScreenBoundary>
      <Application />
    </ScreenBoundary>
  );
}

function Application() {
  const pathname = window.location.pathname;

  // 1. Dynamic SEO Metadata based on the current URL path
  const getSeoData = () => {
    if (pathname === "/about") {
      return {
        title: "About LEQVOR | A More Secure Tomorrow",
        description:
          "Learn about LEQVOR's mission to help you protect what you've built, preserve what matters, and give tomorrow more possibilities through secure digital legacy planning.",
        keywords:
          "digital legacy, asset continuity, secure document storage, estate planning, protect digital assets",
      };
    }
    if (pathname === "/security") {
      return {
        title: "Security & Encryption | LEQVOR",
        description:
          "Learn how LEQVOR's V5 foundation protects your information with local encryption, secure recovery mechanisms, and strict privacy controls.",
        keywords:
          "data encryption, secure recovery, zero-knowledge architecture, privacy, digital security",
      };
    }
    if (pathname === "/trust") {
      return {
        title: "Trust Center | LEQVOR",
        description:
          "Our commitments, current limitations, and how we handle your data with transparency and privacy by design.",
        keywords:
          "data privacy, trust center, LEQVOR security commitments, transparent data handling",
      };
    }
    // Default fallback for homepage or other paths
    return {
      title: "LEQVOR | Digital Legacy & Asset Continuity Platform",
      description:
        "Protect what you've built. Preserve what matters. LEQVOR helps you organize, protect, and pass on digital assets, financial records, and family instructions securely.",
      keywords:
        "digital legacy, asset continuity, secure document storage, estate planning, protect digital assets",
    };
  };

  const seo = getSeoData();

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
      publicTrustPaths.includes(pathname)
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
  }, [pathname]);

  // 2. Assign the correct component to 'content' based on your existing logic
  let content;

  if (publicTrustPaths.includes(pathname)) {
    content = <Trust />;
  } else if (
    new URLSearchParams(window.location.search).get("preview") === "1"
  ) {
    content = <Workspace demo />;
  } else if (auth.loading) {
    content = (
      <main className="loading-page">
        <span className="spinner" />
        <p>Opening your vault…</p>
      </main>
    );
  } else if (auth.recovery && auth.session) {
    content = (
      <ResetPassword
        onDone={() => setAuth((value) => ({ ...value, recovery: false }))}
      />
    );
  } else if (!auth.session) {
    content = (
      <>
        {auth.error && (
          <div className="notice" role="alert">
            {auth.error}
          </div>
        )}
        <Auth />
      </>
    );
  } else {
    content = (
      <MfaGate key={auth.session.user.id}>
        <VaultGate session={auth.session}>
          <Workspace session={auth.session} />
        </VaultGate>
      </MfaGate>
    );
  }

  // 3. Return BOTH the Helmet (for SEO) and the content
  return (
    <>
      <Helmet>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <meta name="keywords" content={seo.keywords} />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta property="og:url" content={`https://www.leqvor.me${pathname}`} />
        <meta property="og:type" content="website" />
      </Helmet>
      {content}
    </>
  );
}

function ResetPassword({ onDone }) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm"))
      return setNotice("Passwords don't match.");

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
