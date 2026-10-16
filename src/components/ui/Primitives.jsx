import Icon from "../Icon";
export function Brand() {
  return (
    <span className="leqvor-brand">
      <img className="leqvor-brand-logo" src="/leqvor-logo.png" alt="" width="256" height="256" decoding="async" />
      <span>LEQVOR</span>
      <small>by LENVOR</small>
    </span>
  );
}
export function Button({ children, icon, variant = "secondary", ...props }) {
  return (
    <button className={variant} {...props}>
      {icon && <Icon name={icon} />} {children}
    </button>
  );
}
export function Card({ children, className = "", ...props }) {
  return (
    <section className={`panel ${className}`} {...props}>
      {children}
    </section>
  );
}
export function Badge({ children, tone = "" }) {
  return (
    <span className={`badge ${tone}`}>
      <Icon
        name={
          tone === "success" ? "check" : tone === "warning" ? "clock" : "lock"
        }
        size={13}
      />
      {children}
    </span>
  );
}
export function Progress({ value, label = "Completion" }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function Heading({ eyebrow, title, text, children }) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {text && <p className="muted">{text}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </header>
  );
}
export function Empty({ title, text, children }) {
  return (
    <div className="empty-state">
      <Icon name="vault" size={30} />
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      {children}
    </div>
  );
}
