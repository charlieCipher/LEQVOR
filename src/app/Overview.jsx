import Icon from "../components/Icon";
import {
  Button,
  Card,
  Badge,
  Progress,
  Empty,
} from "../components/ui/Primitives";
import { categories, catIcon } from "./data";
import ContinuityGaps from '../components/continuity/ContinuityGaps';
export default function Overview({ records, people, pct, demo, name, go }) {
  return (
    <>
      <section className="welcome-banner">
        <div>
          <h1>Hello, {name}</h1>
          <p className="welcome-subtitle">Your legacy is a story worth protecting.</p>
          <p className="welcome-caption">Secure today. A safer tomorrow.</p>
        </div>
        <span className="welcome-aside">
          LEGACY<br/>LIVES<br/>LONGER<br/>HERE.<i/>
        </span>
      </section>
      <div className="overview-top">
        <Card className="health-card">
          <div className="panel-heading">
            <span className="shield-emblem">
              <Icon name="shield" size={56} />
            </span>
            <div>
              <h2>Vault Health</h2>
              <p className="muted">Your information is safe, encrypted, and preserved.</p>
            </div>
            <Badge tone={demo ? "success" : "warning"}>
              {demo ? "Secure · sample" : "Review needed"}
            </Badge>
          </div>
          <div className="health-metrics">
            {[
              ["lock", "Encryption", demo ? "Active" : "Per record"],
              ["archive", "Backup", demo ? "Up to date" : "Not configured"],
              ["shield", "Access Controls", demo ? "Protected" : "Owner only"],
              ["check", "System Status", demo ? "Operational" : "Local session"],
            ].map(([icon, title, text]) => (
              <div key={title}>
                <Icon name={icon} />
                <span>
                  {title}
                  <strong>
                    <Icon name={demo ? "check" : "info"} size={12} />
                    {text}
                  </strong>
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="readiness">
          <div className="panel-heading">
            <h2>Continuity Readiness</h2>
            <button
              className="icon-button"
              aria-label="Open continuity plan"
              onClick={() => go("/app/continuity")}
            >
              <Icon name="arrow" />
            </button>
          </div>
          <div className="readiness-score">
            <strong>
              {pct}
              <small>%</small>
            </strong>
            <span>
              {demo ? "5 of 6 sections complete" : "Your plan is taking shape"}
            </span>
          </div>
          <Progress value={pct} />
          <p className="muted">
            {demo
              ? "One more thoughtful step toward peace of mind."
              : "Add records, trusted people, and your intentions."}
          </p>
        </Card>
      </div>
      <div className="overview-actions-row"><Card className="quick-actions-panel"><div className="section-label">
        <h2>Quick Actions</h2>
        <span>Make a little progress today.</span>
      </div>
      <div className="quick-actions">
        {[
          [
            "plus",
            "Add an Asset",
            "Store important items or accounts",
            "/app/vault/new",
          ],
          [
            "family",
            "Invite a Family Member",
            "Grant trusted access",
            "/app/people",
          ],
          [
            "heart",
            "Create a Task",
            "Stay on track",
            "/app/continuity",
          ],
          [
            "shield",
            "Start a Plan",
            "Build your continuity plan",
            "/app/continuity",
          ],
        ].map(([icon, title, text, url]) => (
          <button key={title} onClick={() => go(url)}>
            <span className="icon-tile">
              <Icon name={icon} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
      </div>
      </Card><Card className="legacy-quote"><blockquote>“Peace of mind<br/>today creates<br/>freedom tomorrow.”</blockquote><span>LEQVOR</span><i/></Card></div>
      <div className="overview-bottom">
        <Card>
          <div className="panel-heading">
            <h2>Your Assets</h2>
            <span className="count-label">Total Assets<strong>{records.length}</strong></span>
          </div>
          <p className="asset-summary-intro">A complete view of what you’ve entrusted to LEQVOR.</p>
          <div className="asset-summary">
            {categories.slice(1).map((cat) => (
              <button key={cat} onClick={() => go("/app/vault")}>
                <Icon name={catIcon[cat]} />
                <span>
                  {cat==='Personal'?'Family':cat}
                  <small>
                    {records.filter((r) => r.category === cat).length} assets
                  </small>
                </span>
                <Icon name="chevron" size={13} />
              </button>
            ))}
          </div>
          <button
            className="text-button panel-link"
            onClick={() => go("/app/people")}
          >
            <Icon name="family" size={16} />
            {people.length} trusted people <Icon name="arrow" size={15} />
          </button>
        </Card>
        <Card>
          <div className="panel-heading">
            <h2>Recent Activity</h2>
            <Icon name="clock" size={17} />
          </div>
          {records.length ? (
            <div className="activity-list">
              {records.slice(0, 4).map((r, i) => (
                <button key={r.id} onClick={() => go("/app/vault/" + r.id)}>
                  <span className="activity-record-icon"><Icon name={catIcon[r.category] || "file"} size={21} /></span>
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {demo
                        ? [
                            "Record updated",
                            "Documents organized",
                            "Information reviewed",
                            "Record added",
                          ][i]
                        : "Record saved"}
                    </small>
                  </span>
                  <time>{r.updated || "Saved"}</time>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Your story starts here"
              text="Saved records will appear here."
            />
          )}
        </Card>
        <Card className="next-action">
          <div className="insights-heading"><Icon name="family" size={28}/><div><h2>Family Continuity Insights</h2><p>Built for the people who matter most.</p></div></div>
          <div className="insights-body"><div className="progress-ring" style={{'--progress':`${pct*3.6}deg`}}><span>{pct}<small>%</small></span></div><ul>{[[records.length>0,'Important records documented'],[people.length>0,'Trusted circle started'],[demo,'Intentions organized'],[false,demo?'Finish your family letter':'Add your first intentions']].map(([done,text])=><li key={text}><Icon name={done?'check':'circle'} size={15}/>{text}</li>)}</ul></div>
          <Button
            variant="primary"
            icon="arrow"
            onClick={() => go(demo ? "/app/continuity" : "/app/vault/new")}
          >
            {demo ? "Continue family letter" : "Add first record"}
          </Button>
          <small>
            {demo ? "1 pending action" : "Your private archive awaits"}
          </small>
        </Card>
      </div>
      {!demo&&<ContinuityGaps records={records} people={people} go={go}/>}
    </>
  );
}
