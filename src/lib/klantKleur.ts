/**
 * Vaste kleur per klant (en leverancier) voor het initialen-rondje, één op één
 * overgenomen uit het dashboard (`KLANT_KLEUREN` en `klantKleur` in
 * `bb-shared.jsx`). Gekozen kleur = `customers.kleur`; leeg = een kleur die uit
 * het id volgt (FNV-1a met eindmenging, `% 7`), zodat dezelfde klant in app en
 * dashboard hetzelfde rondje heeft. Grijs alleen als iemand hem kiest.
 *
 * Geen imports: `tests/klantKleur.test.mjs` draait dit los in Node.
 */

export type KlantKleur = {
  id: string;
  label: string;
  /** Vlak en tekst zoals het dashboard (licht). */
  bg: string;
  fg: string;
  stip: string;
  /** Donkere modus van de app: dezelfde tint, gedempt vlak en lichte tekst. */
  bgDonker: string;
  fgDonker: string;
};

export const KLANT_KLEUREN: readonly KlantKleur[] = [
  { id: 'groen', label: 'Groen', bg: '#DCFCE7', fg: '#15803D', stip: '#22C55E', bgDonker: 'rgba(34,197,94,0.16)', fgDonker: '#4ADE80' },
  { id: 'blauw', label: 'Blauw', bg: '#DBEAFE', fg: '#1D4ED8', stip: '#3B82F6', bgDonker: 'rgba(59,130,246,0.18)', fgDonker: '#93C5FD' },
  { id: 'paars', label: 'Paars', bg: '#EDE9FE', fg: '#6D28D9', stip: '#8B5CF6', bgDonker: 'rgba(139,92,246,0.20)', fgDonker: '#C4B5FD' },
  { id: 'oranje', label: 'Oranje', bg: '#FFEDD5', fg: '#C2410C', stip: '#F97316', bgDonker: 'rgba(249,115,22,0.18)', fgDonker: '#FDBA74' },
  { id: 'teal', label: 'Teal', bg: '#CCFBF1', fg: '#0F766E', stip: '#14B8A6', bgDonker: 'rgba(20,184,166,0.18)', fgDonker: '#5EEAD4' },
  { id: 'geel', label: 'Geel', bg: '#FEF3C7', fg: '#B45309', stip: '#EAB308', bgDonker: 'rgba(245,158,11,0.18)', fgDonker: '#FCD34D' },
  { id: 'roze', label: 'Roze', bg: '#FCE7F3', fg: '#BE185D', stip: '#EC4899', bgDonker: 'rgba(236,72,153,0.18)', fgDonker: '#F9A8D4' },
  { id: 'grijs', label: 'Grijs', bg: '#F1F5F9', fg: '#475569', stip: '#94A3B8', bgDonker: 'rgba(148,163,184,0.18)', fgDonker: '#CBD5E1' },
];

export type KlantVoorKleur = {
  id?: string | null;
  kleur?: string | null;
  name?: string | null;
  naam?: string | null;
} | null | undefined;

/** Het item uit `KLANT_KLEUREN` voor deze klant (zie `klantKleur` in het dashboard). */
export function klantKleur(klant: KlantVoorKleur): KlantKleur {
  const gekozen = KLANT_KLEUREN.find((k) => k.id === klant?.kleur);
  if (gekozen) return gekozen;
  const bron = String(klant?.id || klant?.name || klant?.naam || '');
  let h = 2166136261;
  for (let i = 0; i < bron.length; i++) {
    h ^= bron.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return KLANT_KLEUREN[(h >>> 0) % (KLANT_KLEUREN.length - 1)] as KlantKleur;
}

/** Vlak- en tekstkleur voor het rondje; `dark` uit `useTheme().colorMode`. */
export function klantAvatarKleuren(klant: KlantVoorKleur, dark: boolean): { bg: string; fg: string } {
  const k = klantKleur(klant);
  return dark ? { bg: k.bgDonker, fg: k.fgDonker } : { bg: k.bg, fg: k.fg };
}
