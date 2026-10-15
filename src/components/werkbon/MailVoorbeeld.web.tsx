/** Web/PWA: de mail in een iframe zonder scripts (sandbox), zoals het dashboard. */
export function MailVoorbeeld({ html, hoogte = 380 }: { html: string; hoogte?: number }) {
  return (
    <iframe
      title="Voorbeeld van de e-mail"
      srcDoc={html}
      sandbox=""
      style={{ width: '100%', height: hoogte, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}
    />
  );
}
