import { ClaimChecklist, LinkedPolicies } from '../components/records/InsuranceSummary';
import V5RecordDetail from "../components/records/V5RecordDetail";
import { useState, useEffect, useId } from "react";
import TabList from '../components/ui/TabList';
import Icon from "../components/Icon";
import {
  Button,
  Card,
  Badge,
  Heading,
  Empty,
  Progress,
} from "../components/ui/Primitives";
import RecordDetail from "../components/RecordDetail";
import { categories, catIcon } from "./data";
export default function Vault({ records, search, setSearch, go, demo=false, pct=0 }) {
  const [category, setCategory] = useState("All"),
    [view, setView] = useState("grid"),
    [status, setStatus] = useState("All statuses"),
    [filters, setFilters] = useState(false),
    [page, setPage] = useState(1);
  const filterKey = JSON.stringify([category, search, status]);
  const [previousFilterKey, setPreviousFilterKey] = useState(filterKey);
  if (previousFilterKey !== filterKey) {
    setPreviousFilterKey(filterKey);
    setPage(1);
  }
  const filtered = records.filter(
    (r) =>
      (category === "All" || r.category === category) &&
      r.title.toLowerCase().includes(search.toLowerCase()) &&
      (status === "All statuses" ||
        (r.status ||
          (r.encrypted_payload ? "Protected" : "Needs encryption")) === status),
  );
  const pageCount=Math.max(1,Math.ceil(filtered.length/5)), currentPage=Math.min(page,pageCount);
  return (
    <>
      <Heading
        eyebrow="PRESERVE / ORGANIZE / PROTECT"
        title="Your Assets Library"
        text="More than assets. A stronger tomorrow."
      >
        <Button
          variant="primary"
          icon="plus"
          onClick={() => go("/app/vault/new")}
        >
          Add Asset
        </Button>
      </Heading>
      <div className="library-stat-cards">{[['archive','Total Assets',records.length,'Across your private archive'],['shield',demo?'Protected Value':'Protected Records',demo?'$12.4M':records.filter(r=>r.demo||r.encrypted_payload).length,demo?'Across all asset categories':'Sensitive details remain hidden'],['file','Files Stored',records.reduce((a,r)=>a+(r.files||r.file_count||(r.file_path?1:0)),0),'Encrypted and safe']].map(([icon,label,value,text])=><Card key={label}><span className="icon-tile"><Icon name={icon} size={35}/></span><div><h2>{label}</h2><strong>{value}</strong><small>{text}</small></div></Card>)}<Card><div className="progress-ring" style={{'--progress':pct*3.6+'deg'}}><span>{pct}%</span></div><div><h2>Completion Score</h2><p>You’re on a strong path.</p><button className="text-button" onClick={()=>go('/app/continuity')}>Complete your library ›</button></div></Card></div><div className="library-archive"><div className="category-tabs" role="group" aria-label="Asset category">
        {categories.map((c) => (
          <button
            type="button"
            aria-pressed={category === c}
            className={category === c ? "active" : ""}
            key={c}
            onClick={() => setCategory(c)}
          >
            {c !== "All" && <Icon name={catIcon[c]} size={17} />} {c==='Personal'?'Family':c}
          </button>
        ))}
      </div>
      {category === "Insurance" && <div className="insurance-entry"><span>Policies connected to people, assets, and instructions.</span><Button icon="shield" onClick={()=>go("/app/vault/insurance")}>Open Insurance Hub</Button></div>}
      <div className="library-toolbar">
        <label className="search-field">
          <Icon name="search" size={18} />
          <input
            aria-label="Search your assets"
            placeholder="Search your assets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Button
          icon="filter"
          onClick={() => setFilters(!filters)}
          aria-expanded={filters}
        >
          Filters{status !== "All statuses" ? " · 1" : ""}
        </Button>
        <span className="result-count" role="status" aria-live="polite" aria-atomic="true">{filtered.length} records</span>
        <div className="view-switch">
          <button
            className={view === "grid" ? "active" : ""}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Icon name="grid" size={18} />
          </button>
          <button
            className={view === "list" ? "active" : ""}
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <Icon name="list" size={18} />
          </button>
        </div>
      </div>
      {filters && (
        <div className="filter-row">
          <label>
            Status{" "}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {[
                "All statuses",
                "Protected",
                "In progress",
                "Needs encryption",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => {
              setCategory("All");
              setStatus("All statuses");
              setSearch("");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
      <div className="library-content"><div className="library-records">{!filtered.length ? (
        <Card>
          <Empty
            title={
              records.length
                ? "No matching records"
                : "Your private archive starts here"
            }
            text={
              records.length
                ? "Try another search or clear your filters."
                : "Add a record, then safely organize its details and documents."
            }
          >
            <Button
              onClick={() =>
                records.length
                  ? (setSearch(""),
                    setCategory("All"),
                    setStatus("All statuses"))
                  : go("/app/vault/new")
              }
            >
              {records.length ? "Clear filters" : "Add Asset"}
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          {view === "grid" && (
            <div className="record-grid">
              {filtered.slice(0,4).map((r) => (
                <button
                  className="asset-card"
                  key={r.id}
                  onClick={() => go("/app/vault/" + r.id)}
                >
                  <div className={"asset-card-top asset-cover cover-"+r.category.toLowerCase()}>
                    <span className="archive-icon">
                      <Icon name={catIcon[r.category] || "file"} size={30} />
                    </span>
                    <Icon name="arrow" size={16} />
                  </div>
                  <p className="eyebrow"><Icon name={catIcon[r.category]} size={13}/>{r.category}</p>
                  <h2>{r.title}</h2>
                  <Badge
                    tone={
                      r.status === "In progress"
                        ? "warning"
                        : r.demo || r.encrypted_payload
                          ? "success"
                          : "warning"
                    }
                  >
                    {r.status ||
                      (r.encrypted_payload ? "Protected" : "Needs encryption")}
                  </Badge>
                  <div className="asset-card-meta">
                    <span>
                      <Icon name="file" size={14} />
                      {r.files || (r.file_path ? 1 : 0)} documents
                    </span>
                    <span>
                      <Icon name="family" size={14} />
                      {r.people || 0} trusted people
                    </span>
                  </div>
                  <div className="asset-card-footer">
                    Reviewed{" "}
                    {r.updated ||
                      (r.created_at
                        ? new Date(r.created_at).toLocaleDateString()
                        : "just now")}
                    <Icon name="lock" size={13} />
                  </div><div className="asset-card-actions"><span><Icon name="eye" size={14}/>View</span><span><Icon name="settings" size={14}/>Manage</span></div>
                </button>
              ))}
            </div>
          )}
          <div className="section-label">
            <h2>{view === "grid" ? "Detailed records" : "All records"}</h2>
            <span>Sensitive information stays hidden.</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Record",
                    "Category",
                    "Status",
                    "Documents",
                    "Last reviewed",
                    "",
                  ].map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((currentPage-1)*5,currentPage*5).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        className="table-record"
                        onClick={() => go("/app/vault/" + r.id)}
                      >
                        <Icon name={catIcon[r.category] || "file"} />
                        {r.title}
                      </button>
                    </td>
                    <td>{r.category}</td>
                    <td>
                      <Badge
                        tone={
                          r.status === "In progress" ? "warning" : "success"
                        }
                      >
                        {r.status ||
                          (r.encrypted_payload ? "Encrypted" : "Older record")}
                      </Badge>
                    </td>
                    <td>{r.files || (r.file_path ? 1 : 0)}</td>
                    <td>{r.updated || "Recently"}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={"Open " + r.title}
                        onClick={() => go("/app/vault/" + r.id)}
                      >
                        <Icon name="arrow" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div><div className="table-pagination"><span>Showing {(currentPage-1)*5+1}–{Math.min(currentPage*5,filtered.length)} of {filtered.length} records</span><button className="icon-button" aria-label="Previous records page" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>‹</button>{Array.from({length:pageCount},(_,i)=><button key={i} className={currentPage===i+1?"selected":""} aria-label={"Records page "+(i+1)} aria-current={currentPage===i+1?"page":undefined} onClick={()=>setPage(i+1)}>{i+1}</button>)}<button className="icon-button" aria-label="Next records page" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}>›</button></div>
        </>
      )}
</div><aside className="library-aside"><Card><h2><Icon name="archive"/>Storage Usage</h2><p>{records.reduce((a,r)=>a+(r.files||r.file_count||0),0)} files in your archive</p><Progress value={demo?18:0}/><small>{demo?'18% · sample storage':'Usage available after storage connection'}</small></Card><Card><h2>Quick Actions</h2>{[['file','Add a New Asset','Store important items or records','/app/vault/new'],['plus','Upload Files','Add documents to an asset','/app/vault/new'],['family','Invite a Family Member','Grant trusted access','/app/people'],['circle','Create a Task','Stay on track with your plan','/app/continuity']].map(([icon,title,text,url])=><button key={title} onClick={()=>go(url)}><Icon name={icon} size={18}/><span>{title}<small>{text}</small></span><Icon name="chevron" size={13}/></button>)}</Card><Card className="library-quote"><blockquote>“Security today<br/>creates freedom<br/>tomorrow.”</blockquote><small>LEQVOR</small></Card></aside></div><div className="storage-note">
        <Icon name="archive" size={18} />
        <span>
          {records.reduce((a, r) => a + (r.files || (r.file_path ? 1 : 0)), 0)}{" "}
          files in your archive
        </span>
        <span>Basic encryption is always included.</span>
      </div></div>
    </>
  );
}
export function RecordPage({ record, go, onLock, onChanged, records=[], people=[] }) {
  const tabsId = useId();
  const sections = ['Overview', 'Documents', 'People', 'Instructions', 'Related Records', 'Access', 'History'];
  const [tab, setTab] = useState("Overview"),
    [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 30000);
    return () => clearTimeout(timer);
  }, [revealed]);
  if (!record)
    return (
      <Empty
        title="Record not found"
        text="It may have been removed or is not available to this account."
      >
        <Button onClick={() => go("/app/vault")}>Back to library</Button>
      </Empty>
    );
  return (
    <>
      <button
        className="text-button back-link"
        onClick={() => go("/app/vault")}
      >
        ← Back to your library
      </button>
      <Heading
        eyebrow={record.category}
        title={record.title}
        text="A private record. Preserved with intention."
      >
        <Badge tone="success">
          {record.demo
            ? "Protected · sample"
            : record.encrypted_payload
              ? "Encrypted"
              : "Older record"}
        </Badge>
      </Heading>
      <TabList id={tabsId} label="Record sections" items={sections} value={tab} onChange={section => {
        setTab(section);
        setRevealed(false);
      }} />
      {record.category === "Insurance" && <Card className="policy-readiness"><ClaimChecklist record={record} people={people}/><div className="insurance-roles">{[["Owner",[record.insurance_index?.owner_id]],["Insured",record.insurance_index?.insured_ids],["Beneficiary",record.insurance_index?.beneficiary_ids]].map(([role,ids])=><div key={role}><h3>{role}</h3><p>{(ids||[]).filter(Boolean).map(id=>id==="self"?"You":people.find(p=>p.id===id)?.display_name||"Linked person unavailable").join(", ")||"Not recorded"}</p></div>)}</div><div className="linked-policies"><h3>Linked assets</h3>{record.insurance_index?.asset_ids?.length?record.insurance_index.asset_ids.map(id=>{const asset=records.find(r=>r.id===id);return asset?<button className="text-button" key={id} onClick={()=>go("/app/vault/"+id)}>{asset.title} →</button>:<p key={id} className="muted">Linked asset unavailable.</p>}):<p className="muted">No assets linked.</p>}</div><button className="text-button" onClick={()=>go("/app/vault/insurance")}>Insurance Hub →</button></Card>}
      {record.category !== "Insurance" && <Card><LinkedPolicies records={records} assetId={record.id} go={go}/></Card>}
      <div className="record-layout">
        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${sections.indexOf(tab)}`} tabIndex={0}>
          {tab === "Overview" ? (
            record.demo ? (
              <Card className="locked-content">
                <span className="lock-medallion">
                  <Icon name="lock" size={30} />
                </span>
                <h2>Encrypted Information</h2>
                <p className="muted">
                  {revealed
                    ? "This is a sample record. No real private information is stored here."
                    : "Sensitive information hidden"}
                </p>
                <Button
                  variant="primary"
                  icon={revealed ? "lock" : "eye"}
                  onClick={() => setRevealed(!revealed)}
                >
                  {revealed ? "Hide information" : "Reveal securely"}
                </Button>
                <p className="field-hint">
                  {revealed
                    ? "Sample preview closes automatically after 30 seconds."
                    : "Real records require your vault secret to reveal."}
                </p>
              </Card>
            ) : record.v5 ? (
              <V5RecordDetail
                key={`${record.id}:${record.revision}`}
                record={record}
                records={records}
                people={people}
                onOpenRecord={id=>go(`/app/vault/${encodeURIComponent(id)}`)}
                onChanged={onChanged}
                onDeleted={() => {
                  onChanged?.();
                  go("/app/vault");
                }}
              />
            ) : (
              <RecordDetail record={record} onLock={onLock} />
            )
          ) : tab === "Documents" ? (
            <Card>
              <h2>Documents</h2>
              {record.demo ? (
                <>
                  {(record.category === "Insurance"
                    ? ["Policy_Schedule.pdf", "Policy_Documents.pdf"]
                    : ["Property_Deed.pdf", "Registration.pdf"]).map((f) => (
                    <div className="document-row" key={f}>
                      <Icon name="file" />
                      <span>
                        {f}
                        <small>Sample document · content unavailable</small>
                      </span>
                      <Icon name="lock" />
                    </div>
                  ))}
                </>
              ) : (
                <p className="muted">
                  {(record.file_path || record.files || record.file_count)
                    ? "Reveal this record in Overview to decrypt and download its attachment."
                    : "No documents attached to this record."}
                </p>
              )}
            </Card>
          ) : tab === "Access" || tab === "People" ? (
            <Card>
              <h2>
                {tab === "Access"
                  ? "Continuity Grants"
                  : "People connected to this record"}
              </h2>
              <p className="muted">Relationships do not grant permissions.</p>
              {record.demo ? (
                <>
                  <div className="setting-row">
                    <span>Spouse</span>
                    <Badge>Selected access · sample</Badge>
                  </div>
                  <div className="setting-row">
                    <span>Lawyer</span>
                    <Badge>No access · sample</Badge>
                  </div>
                </>
              ) : (
                <p>
                  Owner only. Sharing keys and verified permission grants are
                  not configured.
                </p>
              )}
            </Card>
          ) : tab === "Related Records" ? (
            <Card>
              <h2>Continuity Graph</h2>
              <p className="muted">
                Connect the documents, people, originals, and instructions that
                make this record useful.
              </p>
              {record.demo ? (
                <div className="graph-records">
                  {[
                    "Property Deed → Home insurance",
                    "Property Deed → Home loan",
                    "Property Deed → Tax receipt",
                  ].map((s) => (
                    <p key={s}>
                      <Icon name="file" />
                      {s}
                    </p>
                  ))}
                </div>
              ) : (
                <p>No related records linked.</p>
              )}
            </Card>
          ) : tab === "Instructions" ? (
            <Card>
              <h2>What should happen next?</h2>
              <p className="muted">
                Instructions and original locations are private. Reveal this
                record in Overview to read them.
              </p>
            </Card>
          ) : (
            <Card>
              <h2>Record History</h2>
              <div className="document-row">
                <Icon name="clock" />
                <span>
                  Record created
                  <small>
                    {record.demo
                      ? "Sample event"
                      : record.created_at
                        ? new Date(record.created_at).toLocaleString()
                        : "Date unavailable"}
                  </small>
                </span>
              </div>
              <p className="field-hint">
                Verified, tamper-evident version history is not enabled yet.
              </p>
            </Card>
          )}
        </div>
        <Card className="record-aside">
          <p className="eyebrow">PRIVATE BY DESIGN</p>
          <Icon name="shield" size={32} />
          <h2>Yours to reveal.</h2>
          <p className="muted">
            What exists? Why does it matter? Where is the original? Who should
            know? What happens next?
          </p>
          <hr />
          <p className="muted">
            Revealed content closes after 30 seconds, when you leave this
            window, or when you navigate away.
          </p>
        </Card>
      </div>
    </>
  );
}
