import { useState } from 'react';
import { Button, Badge, Empty } from '../ui/Primitives';
import VaultControls from './VaultControls';
import PasskeySettings from './PasskeySettings';
import { sampleDevices, sampleSessions } from './previewPreferences';

import { settings } from './securityDetailCatalog';

export default function SecurityDetails({ name, demo, records = [], preferences, onSave }) {
  const [values, setValues] = useState(preferences || {});
  const [notice, setNotice] = useState('');
  const [devices, setDevices] = useState(preferences?.entries ?? (name === 'Active sessions' ? sampleSessions : sampleDevices));
  const [selected, setSelected] = useState(null);
  const sampleNotice = <p className="notice">{demo ? 'Sample workspace · Changes apply to this preview only. No account protection is changed.' : 'This capability is not connected yet. No security settings can be changed here.'}</p>;
  const save = () => { onSave(values); setNotice('Preview preferences saved for this workspace session.'); };

  if(!demo&&['Passkeys','Face ID / Touch ID','Require biometric confirmation'].includes(name))return <PasskeySettings/>;

  if (name === 'Cold Lock' || name === 'Recovery practice') return <div className="stack-form">
    <p className="muted">{name === 'Cold Lock' ? 'Inactivity and leaving the app clear decrypted content and active key references. Unlock again to continue.' : 'Verify that your offline recovery secret can unlock your vault without revealing records.'}</p>
    {demo ? <>{sampleNotice}{name === 'Cold Lock' ? <><label>Inactivity timeout<select value={values.timeout || '5'} onChange={e => setValues({ ...values, timeout: e.target.value })}><option value="1">1 minute</option><option value="5">5 minutes</option><option value="10">10 minutes</option></select></label><p className="field-hint">Background locking remains immediate. Browsers cannot guarantee forensic memory erasure.</p><Button onClick={save}>Save preview preference</Button></> : <><ol><li>Locate your offline recovery phrase.</li><li>Verify it locally in your signed-in vault.</li><li>Review where your backup is kept.</li></ol><p className="field-hint">Recovery verification requires a real vault. Do not enter your recovery phrase into the sample workspace.</p><Button disabled>Verification requires a real vault</Button></>}</> : <VaultControls/>}
    {notice && <p role="status">{notice}</p>}
  </div>;

  if (name === 'Recovery phrase') return <div className="stack-form">
    <Badge>Kept offline</Badge><p>Your recovery phrase is shown during vault setup. LEQVOR does not store a readable copy to display again.</p>
    <ol><li>Locate your offline recovery copy.</li><li>Use Recovery Practice to verify it.</li><li>Keep it separate from your everyday device.</li></ol>
    {demo ? sampleNotice : <VaultControls/>}
  </div>;

  if (name === 'Trusted devices' || name === 'Active sessions') return <div className="stack-form">
    {sampleNotice}
    {demo ? devices.map((device, i) => <div className="setting-row" key={device}><span><strong>{device}</strong><small>{i === 0 ? 'Current sample device' : 'Sample trusted device'}</small></span><Button disabled={i === 0} onClick={() => setSelected(device)}>{name === 'Active sessions' ? 'End session' : 'Remove'}</Button></div>) : <Empty title="Device registry unavailable" text="Verified devices and server sessions will appear here when device registration is connected."/>}
    {selected && <section className="notice"><h3>{name === 'Active sessions' ? 'End this sample session?' : 'Remove this sample device?'}</h3><p>{selected}</p><div className="form-actions"><Button onClick={() => setSelected(null)}>Cancel</Button><Button onClick={() => { const entries = devices.filter(x => x !== selected); setDevices(entries); onSave({ entries }); setSelected(null); setNotice('Sample entry removed. No real session was revoked.'); }}>Confirm sample removal</Button></div></section>}
    {notice && <p role="status">{notice}</p>}
  </div>;

  if (name === 'Security Timeline') return <div className="stack-form">{sampleNotice}{demo ? <ol className="security-event-list">{['Account authenticated', 'Recovery verification completed', 'Record access reviewed'].map((event, i) => <li key={event}><strong>{event}</strong><small>Sample event {i + 1} · This browser</small><Badge>Illustration only</Badge></li>)}</ol> : <Empty title="No verified events available" text="Signed event history is not connected. Activity will only appear after it can be verified."/>}</div>;

  if (name === 'Account deletion') return <div className="stack-form"><Badge tone="warning">Unavailable</Badge><p>Account deletion requires fresh authentication and a confirmed retention and deletion process.</p><p className="muted">You can review and export your encrypted recovery package from Security. An export should be independently verified before any deletion.</p><Button disabled>Account deletion not available</Button></div>;

  const config = settings[name] || (['Security alerts', 'Access requests', 'Important activity', 'Product updates'].includes(name) ? ['Notification preference', [name]] : null);
  if (config) return <form className="stack-form" onSubmit={e => { e.preventDefault(); if (demo) save(); }}>
    {sampleNotice}<fieldset disabled={!demo}><legend>{config[0]}</legend>{config[1].map(label => <label className="preference-check" key={label}><input type="checkbox" checked={!!values[label]} onChange={e => setValues({ ...values, [label]: e.target.checked })}/><span>{label}</span></label>)}</fieldset>
    {name === 'Shield approvals' && <><label>Approval expires after<select disabled={!demo} value={values.expiry || '30'} onChange={e => setValues({ ...values, expiry: e.target.value })}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select></label><p className="field-hint">The live workflow must use a verified approver, a signed single-use approval and fresh authentication.</p></>}
    {name === 'Duress Protection' && <><p className="muted">Choose what an ordinary alternate environment would contain. This preview does not create another vault or credential.</p><fieldset disabled={!demo}><legend>Sample records to include</legend>{records.map(record => <label className="preference-check" key={record.id}><input type="checkbox" checked={!!values[record.id]} onChange={e => setValues({ ...values, [record.id]: e.target.checked })}/><span>{record.title}</span></label>)}</fieldset></>}
    {name === 'PIN scrambling' && <p className="field-hint">This preference helps reduce simple observation. It does not replace authentication.</p>}
    <Button variant="primary" disabled={!demo}>Save preview preferences</Button>{notice && <p role="status">{notice}</p>}
  </form>;

  return <div className="stack-form">{sampleNotice}<Badge tone="warning">Not enrolled</Badge><p>{name === 'Multi-factor authentication' ? 'Multi-factor authentication adds an additional verification step after account sign-in.' : 'Passkeys use your device authenticator. Biometric data stays with the device; LEQVOR does not receive a fingerprint or face scan.'}</p><ol><li>Verify your account.</li><li>Confirm with your device authenticator.</li><li>Name the device and review its access.</li></ol><Button disabled>{name === 'Multi-factor authentication' ? 'Enrollment requires a real account' : 'Device enrollment not connected'}</Button></div>;
}
