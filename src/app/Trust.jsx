import { Brand, Card, Heading, Button } from "../components/ui/Primitives";
import { pages } from "./trustContent";
import { legalPages, privacyContact } from './legalContent';
export default function Trust() {
  const [title, text, sections] = pages[window.location.pathname];
  return (
    <main className="trust-page">
      <a className="brand" href="/auth">
        <Brand />
      </a>
      <Heading eyebrow="LEQVOR BY LENVOR" title={title} text={text} />
      <nav className="category-tabs" aria-label="Trust and legal pages">
        {Object.entries(pages).map(([path, [title]]) => (
          <a key={path} href={path} aria-current={window.location.pathname === path ? 'page' : undefined}>
            {title}
          </a>
        ))}
      </nav>
      {sections.map(([heading, text]) => (
        <Card key={heading}>
          <h2>{heading}</h2>
          <p className="muted">{text}</p>
        </Card>
      ))}
      {legalPages[window.location.pathname] && <Card>
        <h2>Contact and provider notices</h2>
        <p><a href={`mailto:${privacyContact}`}>Email the LEQVOR privacy contact</a>. Include your request and account email only; do not send vault secrets or private documents.</p>
        <ul>
          <li><a href="https://supabase.com/privacy">Supabase Privacy Notice</a></li>
          <li><a href="https://vercel.com/legal/privacy-notice">Vercel Privacy Notice</a></li>
          <li><a href="https://policies.google.com/privacy">Google Privacy Policy</a></li>
        </ul>
      </Card>}
      <Button onClick={() => window.location.assign("/auth")}>
        Return to sign in
      </Button>
    </main>
  );
}
