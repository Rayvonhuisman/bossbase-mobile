// ── Getallen invoeren zoals in Nederland ────────────────────────────────────
// Zelfde regels als src/lib/getalNl.js in het dashboard (pas ze samen aan):
// de komma is het decimaalteken; een punt is een duizendtal als er nog een komma
// achter komt, als er meer punten zijn, of als er precies drie cijfers op volgen
// ("1.250" = 1250). Anders is de punt een decimaalteken ("12.5" = 12,5).
// Voorheen werd "1.234,56" hier stil 0 (besluit 26-10: "1.234,56" moet werken).

/** Tekst → getal. Leeg geeft null, onleesbaar geeft NaN. */
export function leesGetalNl(invoer: string | number | null | undefined): number | null {
  if (invoer === null || invoer === undefined) return null;
  if (typeof invoer === 'number') return Number.isFinite(invoer) ? invoer : NaN;
  let s = String(invoer).replace(/[\s\u00a0\u20ac]/g, '');
  if (!s) return null;
  let teken = '';
  if (s[0] === '-' || s[0] === '+') { teken = s[0] === '-' ? '-' : ''; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
  const komma = s.lastIndexOf(',');
  if (komma >= 0) {
    if (s.indexOf(',') !== komma) return NaN;        // twee komma's
    const voor = s.slice(0, komma);
    const na = s.slice(komma + 1);
    if (na.includes('.') || !duizendtallenOk(voor)) return NaN;
    return Number(`${teken}${voor.replace(/\./g, '') || '0'}.${na || '0'}`);
  }
  const punten = s.split('.').length - 1;
  if (punten === 0) return Number(teken + s);
  if (punten > 1) return duizendtallenOk(s) ? Number(teken + s.replace(/\./g, '')) : NaN;
  const [voor = '', na = ''] = s.split('.');
  if (na.length === 3 && /^[1-9]\d{0,2}$/.test(voor)) return Number(teken + voor + na);
  return Number(`${teken}${voor || '0'}.${na || '0'}`);
}

// "1.234.567" of "1234": groepjes van drie na de eerste.
function duizendtallenOk(s: string): boolean {
  if (!s.includes('.')) return true;
  return /^\d{1,3}(\.\d{3})+$/.test(s);
}

/** Zoals leesGetalNl, maar leeg of onleesbaar wordt 0 (voor bedragen in totalen). */
export function getalOfNul(invoer: string | number | null | undefined): number {
  const n = leesGetalNl(invoer);
  return n === null || Number.isNaN(n) ? 0 : n;
}
