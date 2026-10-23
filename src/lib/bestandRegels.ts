/**
 * Regels voor eigen bestanden (blok Bestanden), zonder afhankelijkheden zodat
 * ze los te testen zijn. Zelfde lijst en grenzen als het dashboard
 * (bestandenService.js), de bucket `bestanden` en de check op de tabel.
 */

// ── Wat je zelf mag uploaden ────────────────────────────────────────────────
// Zelfde lijst als de bucket en de check op de tabel; geen SVG of HTML (die kan
// een browser als pagina uitvoeren).
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
};
const TOEGESTAAN = new Set(Object.values(TYPES));
export const BESTAND_MAX = 25 * 1024 * 1024;
export const BESTAND_MAX_PER_KEER = 20;
export const BESTAND_TYPES_UITLEG = 'PDF, foto, Word, Excel, CSV, tekst of DWG/DXF · max 25 MB per bestand';

export const extensie = (naam: string | null | undefined) => (String(naam || '').split('.').pop() || '').toLowerCase();

/** Een gekozen bestand, klaar om te uploaden. */
export type GekozenBestand = { naam: string; bytes: ArrayBuffer; mime: string | null };

/**
 * Het type dat we opslaan: dat van het toestel als het op de lijst staat, anders
 * op de extensie (een .dwg komt vaak zonder type binnen).
 */
export function bestandType(b: { naam: string; mime?: string | null }): string | null {
  if (b.mime && TOEGESTAAN.has(b.mime)) return b.mime;
  return TYPES[extensie(b.naam)] ?? null;
}

/** Waarom dit bestand niet kan, of null. */
export function bestandFout(b: { naam: string; mime?: string | null; grootte: number }): string | null {
  if (!bestandType(b)) return `${b.naam}: dit soort bestand kan niet. ${BESTAND_TYPES_UITLEG}.`;
  if (b.grootte <= 0) return `${b.naam}: het bestand is leeg.`;
  if (b.grootte > BESTAND_MAX) return `${b.naam}: het bestand is te groot. Maximaal 25 MB.`;
  return null;
}

/** Naam zonder extensie, als voorstel voor de weergavenaam. */
export function naamZonderExtensie(naam: string): string {
  const s = String(naam || '');
  const i = s.lastIndexOf('.');
  return (i > 0 ? s.slice(0, i) : s).slice(0, 200);
}

/** Bestandsnaam in de opslag: alleen veilige tekens, extensie behouden. */
export function veiligeNaam(naam: string): string {
  const s = String(naam || '');
  const i = s.lastIndexOf('.');
  const stam = (i > 0 ? s.slice(0, i) : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const ext = (i > 0 ? s.slice(i + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  return `${stam || 'bestand'}${ext ? `.${ext}` : ''}`;
}

/** Bestandsnaam voor delen en bewaren: de weergavenaam met de juiste extensie. */
export function downloadNaam(b: { naam: string; pad: string | null; mime: string }): string {
  const extUitPad = b.pad ? extensie(b.pad) : '';
  const ext = extUitPad || (b.mime === 'application/pdf' ? 'pdf' : '');
  const stam = String(b.naam || 'bestand').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'bestand';
  return ext && !stam.toLowerCase().endsWith(`.${ext}`) ? `${stam}.${ext}` : stam;
}

/** Kan de app dit zelf tonen? PDF en gewone foto's; de rest delen of bewaren. */
export function isTeBekijken(b: { mime: string }): boolean {
  return /^application\/pdf$|^image\/(jpeg|png|webp|gif)$/.test(b.mime || '');
}
