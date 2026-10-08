import Insurance from './Insurance';
import SecurityDetails from '../components/security/SecurityDetails';
import { securityDetailNames } from '../components/security/securityDetailCatalog';
import { detailPreferences, saveDetailPreferences } from '../components/security/previewPreferences';
import AccessPlanner from '../components/people/AccessPlanner';
import LegacyImport from "../components/security/LegacyImport";
import MfaSetup from "../components/security/MfaSetup";
import Pricing from "../Pricing";
import { assessReadiness } from "../modules/continuity/readiness";
import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import {
  Brand,
  Button,
  Heading,
  Card,
  Empty,
} from "../components/ui/Primitives";
import Modal from "../components/Modal";
import RecordWizard from "./RecordWizard";
import { useVault } from "../features/vault/VaultContext";
import SelectedSharing from '../components/people/SelectedSharing';
import { DatabaseProvider, ObjectStorageProvider } from "../lib/providers";
import SecureAction from "../components/security/SecureAction";
import { digest } from "../modules/security/v5Crypto";
import { validateRecoveryPackage } from "../modules/security/recoveryPackage";
import { assetService } from "../modules/vault/AssetService";
import { familyService } from "../modules/family/FamilyService";
import { legacyService } from "../modules/legacy/LegacyService";
import { supabase } from "../supabase";
import { errorMessage } from "../shared/utils/errors";
import {safeFailure} from '../modules/security/safeEvents';
import { nav, sampleRecords, samplePeople } from "./data";
import Overview from "./Overview";
import Vault, { RecordPage } from "./Vault";
import People from "./People";
import Continuity from "./Continuity";
import Security from "./Security";
function pathNow() {
  return window.location.pathname.startsWith("/app")
    ? window.location.pathname
    : "/app";
}
export default function Workspace({ session, demo = false }) {
  const vaultContext = useVault();
  const [secureExport, setSecureExport] = useState(false);
  const [previewPreferences, setPreviewPreferences] = useState({});
  const [accessPlans, setAccessPlans] = useState([]);
  const [path, setPath] = useState(pathNow),
    [records, setRecords] = useState(demo ? sampleRecords : []),
    [people, setPeople] = useState(demo ? samplePeople : []),
    [letters, setLetters] = useState([]),
    [loading, setLoading] = useState(!demo),
    [issues, setIssues] = useState([]),
    [refresh, setRefresh] = useState(0),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [epoch, setEpoch] = useState(0),
    [search, setSearch] = useState("");
  const [globalQuery,setGlobalQuery]=useState('');
  const mainContent = useRef(null);
  const previousPath = useRef(path);
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (previousPath.current !== path) {
      previousPath.current = path;
      pendingFocus.current = true;
    }
    if (modal) { pendingFocus.current = false; return; }
    if (pendingFocus.current && !loading) {
      mainContent.current?.focus({ preventScroll: true });
      pendingFocus.current = false;
    }
  }, [path, loading, modal]);
  const rawName = demo
    ? "Shounak"
    : session.user.user_metadata?.name || session.user.email?.split("@")[0] || "there";
  const name = rawName.trim()
    .replace(/^shounak[\s._-]*zade\.?$/i, "Shounak Zade")
    .replace(/[._-]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  function go(next) {
    window.history.pushState({}, "", next + (demo ? "?preview=1" : ""));
    setPath(next);
    setModal(null);
    setEpoch((e) => e + 1);
    setSearch("");
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    const pop = () => {
      setPath(pathNow());
      setModal(null);
      setEpoch((e) => e + 1);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (demo) return;
    let alive = true;
    const v5Records=vaultContext?.service.list();
    Promise.allSettled(
      vaultContext
        ? [
            v5Records.then((data) => ({ data })),
            vaultContext.service.people().then((data) => ({ data })),
            v5Records
              .then((data) => ({
                data: data.filter((r) => r.kind === "statement"),
              })),
          ]
        : [
            assetService.listAssets(),
            familyService.listMembers(),
            legacyService.listStatements(),
          ],
    ).then((results) => {
      if (!alive) return;
      const setters = [setRecords, setPeople, setLetters],
        labels = ["Records", "Family", "Letters"],
        errors = [];
      results.forEach((r, i) => {
        const error = r.status === "rejected" ? r.reason : r.value.error;
        if (error) errors.push(`${labels[i]}: ${vaultContext?safeFailure(error):errorMessage(error)}`);
        else setters[i](r.value.data || []);
      });
      setIssues(errors);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [demo, refresh, vaultContext]);
  useEffect(() => {
    const lock = () => {
      setEpoch((e) => e + 1);
      setModal(null);
    };
    const hidden = () => {
      if (document.visibilityState !== "visible") lock();
    };
    const key = (e) => {
      if (e.key === "Escape") lock();
    };
    window.addEventListener("blur", lock);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("blur", lock);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = (text) => setToast(text),
    pct = demo ? 83 : assessReadiness(records).percent,
    active =
      nav.find(([url]) => url !== "/app" && path.startsWith(url)) || nav[0];
  async function signOut() {
    if (demo) {
      window.location.assign("/auth");
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) notify(errorMessage(error));
    else window.location.assign("/auth");
  }
  function legacyExport() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "leqvor-encrypted-export-v1",
            records: records.filter((r) => !r.demo),
            letters,
            people: people.filter((p) => !p.demo),
            note: "Attachments excluded. Titles and contact names are unencrypted metadata.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leqvor-encrypted-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Export downloaded. Store it privately.");
  }
  async function exportVault() {
    if (demo || !vaultContext) {
      legacyExport();
      return;
    }
    setSecureExport(true);
  }
  async function downloadPackage() {
    const records = await DatabaseProvider.listRecords(),
      files = await DatabaseProvider.allFiles(),
      people = await DatabaseProvider.people(),
      versions = await DatabaseProvider.allRecordVersions();
    const objects = [];
    for (const file of files)
      objects.push({
        path: file.storage_path,
        envelope: await ObjectStorageProvider.download(file.storage_path),
      });
    const content = {
      format: "leqvor-recovery-package-v5",
      vault: vaultContext.vault,
      records,
      files,
      people,
      versions,
      objects,
      instructions:
        "Use the V5 recovery implementation with your 24-word secret. Account credentials are not a vault secret.",
    };
    const recoveryPackage = { content, manifest: await digest(content) };
    await validateRecoveryPackage(recoveryPackage);
    const blob = new Blob(
      [JSON.stringify(recoveryPackage, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "encrypted-vault.leqvor";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSecureExport(false);
    notify("Encrypted recovery package downloaded.");
  }
  return (
    <div className="app-shell leqvor">
      <a className="skip-link" href="#main-content" onClick={() => mainContent.current?.focus()}>
        Skip to content
      </a>
      <aside className="sidebar">
        <a href={demo ? "/app?preview=1" : "/app"} className="brand">
          <Brand />
        </a>
        <p className="brand-motto">
          ASSETS <i /> RECORDS <i /> FOREVER
        </p>
        <p className="nav-caption">YOUR PRIVATE WORKSPACE</p>
        <nav aria-label="Main navigation">
          {nav.map(([url, label, icon]) => (
            <button
              key={url}
              aria-current={active[0] === url ? "page" : undefined}
              className={active[0] === url ? "active" : ""}
              onClick={() => go(url)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {url === "/app/vault" && <small>{records.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="preserve-note">
            <span />
            PRESERVE<br />
            PLAN<br />
            PROTECT<br />
            FOREVER
          </div>
          <button
            onClick={() => {
              go("/app/security");
              setModal("Account");
            }}
          >
            <Icon name="user" />
            Account
          </button>
          <button onClick={() => setModal("Help")}>
            <Icon name="help" />
            Help & support
          </button>
          <div className="sidebar-security">
            <Icon name="lock" size={15} /> Private by design
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <form className="global-search" onSubmit={event=>{event.preventDefault();go('/app/vault');setSearch(globalQuery);}}>
            <Icon name="search" size={20}/>
            <input aria-label="Search records across your vault" value={globalQuery} onChange={event=>setGlobalQuery(event.target.value)} placeholder="Search assets, records, or documents…"/>
            <button type="submit" aria-label="Search vault"><Icon name="arrow" size={17}/></button>
          </form>
          <div className="topbar-tools">
            <span className="session-label">
              <Icon name="lock" size={14} />
              {demo ? "Sample workspace" : "Signed in"}
            </span>
            <button
              className="icon-button"
              aria-label="Lock private content"
              title="Lock private content"
              onClick={() => {
                if (vaultContext) {
                  vaultContext.lock();
                  return;
                }
                setEpoch((e) => e + 1);
                setModal(null);
                notify("Private content locked.");
              }}
            >
              <Icon name="lock" />
            </button>
            <button
              className="profile-button"
              onClick={() => setModal("Account")}
            >
              <span className="avatar">{name[0]}</span>
              <span>
                {name}
                <small>{demo ? "Sample account" : "Account owner"}</small>
              </span>
              <Icon name="chevron" size={15} />
            </button>
            <span className="brand-values">TRUST<br/>DISCRETION<br/>CONTINUITY<i/></span>
          </div>
        </header>
        <main ref={mainContent} tabIndex={-1} aria-label={`${active[1]} content`} id="main-content" className="workspace-content">
          {demo && (
            <div className="demo-strip">
              <span>DESIGN PREVIEW</span> Sample information · changes stay in
              this session{" "}
              <a href="/auth">
                Go to sign in <Icon name="arrow" size={14} />
              </a>
            </div>
          )}
          {issues.length > 0 && (
            <div className="notice" role="alert">
              <p>Some information could not load. Lists and completion totals may be incomplete until you retry.</p>
              {issues.join(" · ")}
              <Button
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  setRefresh((r) => r + 1);
                }}
              >
                {loading ? "Retrying…" : "Try again"}
              </Button>
            </div>
          )}
          {loading ? (
            <div className="loading-state" role="status">
              <span className="spinner" aria-hidden="true" />
              Loading your vault…
            </div>
          ) : path === "/app" ? (
            <Overview {...{ records, people, pct, demo, name, go }} />
          ) : (path === "/app/vault" || path === "/app/records") ? (
            <Vault {...{ records, search, setSearch, go, demo, pct }} />
          ) : path === "/app/vault/insurance" ? (
            <Insurance {...{records, people, go, demo}}/>
          ) : (path === "/app/vault/new" || path === "/app/vault/new/insurance") ? (
            <>
              <Heading
                eyebrow="YOUR VAULT / NEW RECORD"
                title="Add Important Record"
                text="A small step today. Lasting clarity for tomorrow."
              />
              <Card className="record-create">
                <RecordWizard
                  key={epoch}
                  demo={demo}
                  records={records}
                  people={people}
                  initialCategory={path.endsWith("/insurance")?"Insurance":"Property"}
                  onCancel={() => go("/app/vault")}
                  onSaved={(r) => {
                    setRecords((old) => [r, ...old]);
                    go("/app/vault/" + r.id);
                    notify(
                      demo
                        ? "Sample record saved."
                        : "Your record is encrypted and saved.",
                    );
                  }}
                />
              </Card>
            </>
          ) : path.startsWith("/app/vault/") ? (
            <RecordPage
              key={`${path}-${epoch}`}
              record={records.find(
                (r) => r.id === decodeURIComponent(path.split("/").pop()),
              )}
              {...{ go, demo, records, people }}
              onChanged={() => setRefresh((n) => n + 1)}
              onLock={() => setEpoch((e) => e + 1)}
            />
          ) : (path === "/app/people" || path === "/app/access") ? (
            <People
              {...{ people, setPeople, demo, session, setModal, notify, records, go }}
            />
          ) : path === "/app/continuity" ? (
            <Continuity
              key={epoch}
              {...{ pct, demo, letters, setLetters, session, go, records, people }}
            />
          ) : path === "/app/security" ? (
            <Security {...{ demo, notify, setModal, exportVault, previewPreferences }} />
          ) : (
            <Empty
              title="Page not found"
              text="Return to your private workspace."
            >
              <Button onClick={() => go("/app")}>Go to overview</Button>
            </Empty>
          )}
          <footer className="workspace-footer"><span className="footer-motto">“WHAT ENDURES IS A MORE SECURE TOMORROW.”</span>
            <span>
              LEQVOR <small>by LENVOR</small>
            </span>
            <span>
              Assets <i /> Records <i /> Forever
            </span>
          </footer>
          <nav className="legal-links" aria-label="Legal information"><a href="/privacy">Privacy Notice</a><a href="/terms">Terms of Use</a><a href="/trust">Trust Center</a></nav>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[nav[0], nav[1], ["/app/continuity", "Continuity", "heart"], nav[3], ["more", "More", "menu"]].map(
          ([url, label, icon]) => (
            <button
              key={url}
              className={active[0] === url ? "active" : ""}
              aria-current={active[0] === url ? "page" : undefined}
              onClick={() => (url === "more" ? setModal("More") : go(url))}
            >
              <Icon name={icon} />
              <span>{label === "Overview" ? "Home" : label}</span>
            </button>
          ),
        )}
      </nav>
      {toast && (
        <div role="status" className="toast">
          <Icon name="check" />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {secureExport && (
        <Modal title="Export encrypted recovery package" onClose={() => setSecureExport(false)}>
          <SecureAction
            title="Export encrypted recovery package"
            onVerified={downloadPackage}
          />
        </Modal>
      )}
      {modal && (
        <Modal title={modal} onClose={() => setModal(null)}>
          <h2>{modal}</h2>
          {modal === "Import earlier records" && !demo ? (
            <LegacyImport />
          ) : modal === "Multi-factor authentication" && !demo ? (
            <MfaSetup />
          ) : securityDetailNames.has(modal) ? (
            <SecurityDetails key={modal} name={modal} demo={demo} records={records} preferences={detailPreferences(modal, previewPreferences)} onSave={value => setPreviewPreferences(p => saveDetailPreferences(p, modal, value))}/>
          ) : !demo && (modal==='Share Record'||modal==='Review Permissions') ? (
            <SelectedSharing people={people} records={records}/>
          ) : modal === 'Share Record' || modal === 'Emergency Access' ? (
            <AccessPlanner key={modal} demo={demo} people={people} records={records} emergency={modal === 'Emergency Access'} onSave={plan => setAccessPlans(p => [...p, plan])}/>
          ) : modal === 'Review Permissions' ? (
            <div className="stack-form"><p className="muted">Relationships never grant permissions automatically.</p>{accessPlans.length ? accessPlans.map((plan,i) => <div className="setting-row" key={i}><span><strong>{people.find(p => p.id===plan.person)?.display_name}</strong><small>{plan.records.length} records · {plan.permission} · {plan.condition}</small></span><Button onClick={() => setAccessPlans(p => p.filter((_,index) => index!==i))}>Remove sample plan</Button></div>) : <Empty title="No access plans" text="Use Share Record to review selected access. No real permissions have been granted."/>}</div>
          ) : modal === "Plan" ? (
            <Pricing onClose={() => setModal(null)} />
          ) : modal === "More" ? (
            <div className="stack-form">
              {["Security", "Account", "Plan", "Help"].map((item) => (
                <Button
                  key={item}
                  onClick={() =>
                    item === "Security"
                      ? go("/app/security")
                      : setModal(item)
                  }
                >
                  {item}
                </Button>
              ))}
              <Button onClick={signOut}>Sign out</Button>
            </div>
          ) : modal === "Account" ? (
            <div className="stack-form">
              <p>
                {demo
                  ? "You are exploring a sample account."
                  : session.user.email}
              </p>
              <p className="muted">
                Basic encryption and account protection are included for every
                account.
              </p>
              <Button onClick={signOut} icon="logout">
                {demo ? "Exit sample workspace" : "Sign out"}
              </Button>
            </div>
          ) : modal === 'Help' ? (
            <div className="stack-form"><p>Find your way around your private workspace.</p>{[['Add an important record','/app/vault/new'],['Review trusted people','/app/people'],['Build your continuity plan','/app/continuity'],['Recovery and security','/app/security']].map(([label,url]) => <Button key={url} onClick={() => go(url)}>{label}</Button>)}<details><summary>Account password or vault password?</summary><p>Your account password signs you in. Your separate vault password opens encrypted records. Your offline recovery phrase can recover vault access; an account password reset alone cannot.</p></details><details><summary>What does sharing allow?</summary><p>Access applies to selected records and must be explicitly granted. Being listed as a family member does not grant access.</p></details></div>
          ) : (
            <p className="muted">
              {modal === "Help"
                ? "Your account password signs you in. Your separate vault secret opens encrypted records. Keep that secret offline: a password reset cannot recover it."
                : `${modal} is not connected in this version. No security settings or record permissions have been changed.`}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
