import { policiesForPerson } from '../modules/insurance/continuity';
import TrustedPersonForm from "../components/people/TrustedPersonForm";
import SharingIdentity from '../components/people/SharingIdentity';
import { useVault } from "../features/vault/VaultContext";
import { useState } from "react";
import Icon from "../components/Icon";
import {
  Button,
  Card,
  Badge,
  Heading,
  Empty,
} from "../components/ui/Primitives";
import Modal from "../components/Modal";
import FamilyForm from "../components/FamilyForm";
export default function People({
  people,
  setPeople,
  demo,
  session,
  setModal,
  notify,
  records=[],
  go,
}) {
  const vault = useVault();
  const [selected, setSelected] = useState(null),
    [adding, setAdding] = useState(false);
  const [query,setQuery]=useState(''),[role,setRole]=useState('All Roles');
  const shown=people.filter(p=>p.display_name.toLowerCase().includes(query.toLowerCase())&&(role==='All Roles'||p.relationship===role||p.roles?.includes(role)));
  const portrait=(p)=>p.demo && ['priya','arjun','kiara','rajesh','sunita','daniel','neha'].includes(p.id)?<span className={'person-avatar portrait portrait-'+p.id}/>:<span className="person-avatar">{p.display_name[0]}</span>;
  return (
    <>
      <Heading
        eyebrow="PEOPLE"
        title="Family & Beneficiaries"
        text="The right people. The right access. At the right time."
      />
      <div className="people-actions">
        {[
          ["family", "Invite Member"],
          ["file", "Share Record"],
          ["shield", "Emergency Access"],
          ["filter", "Review Permissions"],
        ].map(([icon, title]) => (
          <Button
            key={title}
            icon={icon}
            onClick={() =>
              title === "Invite Member"
                ? setAdding(true)
                : setModal(title)
            }
          >
            {title}
          </Button>
        ))}
      </div>
      <div className="people-layout">
        <Card>
          <div className="panel-heading">
            <div>
              
              <h2>Your Family Circle</h2>
            </div>
            <div className="people-filters"><label className="search-field"><Icon name="search" size={16}/><input aria-label="Search family members" placeholder="Search family members…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter by relationship" value={role} onChange={e=>setRole(e.target.value)}>{['All Roles',...new Set(people.flatMap(p=>[p.relationship,...(p.roles||[])]))].map(r=><option key={r}>{r}</option>)}</select></div>
          </div>
          <p className="muted">
            Every relationship is personal. Every permission is explicit.
          </p>
          {people.length && !shown.length ? (<Empty title="No matching people" text="Try another name or clear your filters."><Button onClick={()=>{setQuery('');setRole('All Roles');}}>Clear people filters</Button></Empty>) : people.length ? (
            <div className="people-table-wrap"><table className="people-table"><thead><tr>{['Name','Role','Relationship','Access Level','Verification','Trigger Conditions','Invitation',''].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{shown.map(p=><tr key={p.id}><td><button className="person-table-name" onClick={()=>setSelected(p)}>{portrait(p)}<span><strong>{p.display_name}</strong><small>{p.demo?p.display_name.toLowerCase().replaceAll(' ','.')+'@example.com':'Trusted contact'}</small></span></button></td><td><span className="role-pill">{['Son','Daughter'].includes(p.relationship)?'Beneficiary':p.relationship}</span></td><td>{p.relationship}</td><td><Badge>{p.permission||'No access'}</Badge></td><td><span className={'verification '+(p.verification==='Verified'?'verified':'pending')}><Icon name={p.verification==='Verified'?'check':'clock'} size={15}/>{p.verification||'Unverified'}</span></td><td>{p.activation||'None assigned'}</td><td><span className="invitation-state">{p.invitation || (p.demo?(p.verification==='Pending'?'Invited':'Active'):'Not sent')}</span></td><td><button className="icon-button" aria-label={'View '+p.display_name} onClick={()=>setSelected(p)}><Icon name="chevron" size={14}/></button></td></tr>)}</tbody></table>{!shown.length&&<p className="muted">No matching people.</p>}</div>
          ) : (
            <Empty
              title="Build your trusted circle"
              text="Start with one person you trust."
            >
              <Button onClick={() => setAdding(true)}>Add a person</Button>
            </Empty>
          )}
        </Card>
        <div>
          {!demo && <SharingIdentity/>}
          <Card className="trust-map">
            
            <h2>Family Trust Map</h2>
            <div className="map-owner">
              <span className={demo?"person-avatar portrait portrait-owner":"person-avatar"}>{!demo&&"YOU"}</span>
              <strong>You</strong>
              <small>Vault owner</small>
            </div>
            <div className="map-branches">
              {people.slice(0, 7).map((p) => (
                <button key={p.id} onClick={() => setSelected(p)}>
                  {portrait(p)}
                  <strong>{p.display_name.split(" ")[0]}</strong>
                  <small>{p.relationship}</small>
                </button>
              ))}
            </div>
            <p className="field-hint">
              This map shows relationships, not access rights.
            </p>
          </Card>
          <Card className="permissions-overview"><h2>Permissions Overview</h2>{['Full','Selective','View only','No access'].map(level=><div key={level}><Icon name={level==='Full'?'lock':'file'} size={23}/><span>{level}<small>{people.filter(p=>(p.permission||'No access')===level).length} members</small></span><div className="permission-meter"><i style={{width:people.length?people.filter(p=>(p.permission||'No access')===level).length/people.length*100+'%':'0%'}}/></div></div>)}</Card><div className="people-principle">
            <Icon name="shield" />
            <p>
              Trust is personal.
              <br />
              <em>Access is intentional.</em>
            </p>
          </div>
        </div>
      </div>
      {adding && (
        <Modal title="Add to your trusted circle" onClose={() => setAdding(false)}>
          {demo ? (
            <form
              className="stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setPeople((p) => [
                  ...p,
                  {
                    id: crypto.randomUUID(),
                    display_name: f.get("name"),
                    relationship: f.get("relationship"),
                    permission: "No access",
                    verification: "Unverified",
                    demo: true,
                    invitation: 'Not sent',
                  },
                ]);
                setAdding(false);
                notify("Sample contact added. No invitation was sent.");
              }}
            >
              <h2>Add to your trusted circle</h2>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Relationship
                <input name="relationship" required />
              </label>
              <p className="muted">
                Sample contact only. No invitation or permission is granted.
              </p>
              <Button variant="primary">Add sample contact</Button>
            </form>
          ) : vault ? (
            <TrustedPersonForm
              onSaved={(p) => {
                setPeople((old) => [...old, p]);
                setAdding(false);
                notify("Encrypted contact saved. No access granted.");
              }}
            />
          ) : (
            <FamilyForm
              session={session}
              onSaved={(p) => {
                setPeople((old) => [...old, p]);
                setAdding(false);
                notify("Contact saved. No access has been granted.");
              }}
            />
          )}
        </Modal>
      )}
      {selected && (
        <Modal title="Trusted person details" onClose={() => setSelected(null)}>
          <div className="person-detail">
            <span className="person-avatar">{selected.display_name[0]}</span>
            <h2>{selected.display_name}</h2>
            <section className="linked-policies"><h3>Connected policies</h3>{policiesForPerson(records,selected.id).length ? policiesForPerson(records,selected.id).map(({record,roles})=><button className="document-row" key={record.id} onClick={()=>{setSelected(null);go("/app/vault/"+record.id)}}><Icon name="shield"/><span>{record.title}<small>{roles.join(" · ")}</small></span><Icon name="chevron"/></button>):<p className="muted">No policy roles recorded for this person.</p>}</section>
            <p className="muted">{selected.relationship}</p>
            <div className="setting-row"><span>Recorded roles</span><strong>{selected.roles?.join(' · ') || 'Not recorded'}</strong></div>
            <p className="field-hint">Recorded roles describe this person. They do not establish legal authority or grant access.</p>
            {[
              ["Verification", selected.verification || "Unverified"],
              ["Permission", selected.permission || "No access"],
              ["Activation condition", selected.activation || "None"],
              ["Invitation", selected.demo ? "Sample only" : "Not sent"],
              ["Public sharing key", "Not registered"],
              [
                "Assigned records",
                selected.demo
                  ? "Sample permissions only"
                  : String(selected.asset_assignments?.length || 0),
              ],
            ].map(([label, value]) => (
              <div className="setting-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <p className="field-hint">
              A verified identity and a registered sharing key are required
              before real access can be granted.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

