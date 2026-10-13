export { colors } from './colors';

/**
 * BossBase Mobile — designtokens.
 *
 * Bron: het goedgekeurde Claude Design-project "Bossbase CRM mobile app
 * improvement" (`Bossbase Mobile.dc.html`, redesign v2), ingelezen via
 * DesignSync op 2026-09-11.
 *
 * Het ontwerp werkt met CSS-variabelen; die zijn hier één op één omgezet naar
 * de tokensleutels die de app al gebruikt. Dat is bewust: élk scherm leest
 * `useTheme().colors` of `ds`, dus door de WAARDEN te vervangen en de SLEUTELS
 * te laten staan werkt het nieuwe ontwerp overal door zonder dat er honderd
 * schermen hoeven te worden aangeraakt.
 *
 *   ontwerp   →  token
 *   --bg      →  bg
 *   --sf      →  card
 *   --s2      →  bgAlt
 *   --bd      →  line
 *   --t1      →  ink
 *   --t2      →  muted
 *   --t3      →  muted2
 *   --gt      →  green700   (groene tekst/accent)
 *   --gs      →  green50    (groen vlak)
 *   --ink     →  greenInk   (forest ink, tekst óp groen)
 */

// ---------------------------------------------------------------------------
// Typografie
// ---------------------------------------------------------------------------

/**
 * Sora — het lettertype uit het goedgekeurde ontwerp. Wordt centraal geladen
 * door `FontProvider` (zie src/providers/FontProvider.tsx), die de app pas
 * tekent als de families binnen zijn. Daardoor is er geen moment waarop tekst
 * in een ander lettertype staat en daarna verspringt.
 *
 * Alleen de vier gewichten die het ontwerp gebruikt zijn geïnstalleerd:
 * 400 regular, 500 medium, 600 semibold, 700 bold.
 */
const SORA = true;

export const fonts = {
  regular: SORA ? 'Sora_400Regular' : undefined,
  medium: SORA ? 'Sora_500Medium' : undefined,
  semibold: SORA ? 'Sora_600SemiBold' : undefined,
  bold: SORA ? 'Sora_700Bold' : undefined,
} as const;

/**
 * De typeschaal uit het ontwerp. De getallen komen letterlijk uit
 * `Bossbase Mobile.dc.html`; ze zijn niet afgerond of "mooi gemaakt", want dan
 * loopt de implementatie stilletjes uit de pas met het goedgekeurde beeld.
 */
export const typography = {
  /** Paginatitel in de bovenbalk — 26/700. */
  title: { fontSize: 26, lineHeight: 30, fontWeight: '700' as const, fontFamily: fonts.bold },
  /** Kop binnen een scherm of modal. */
  heading: { fontSize: 20, lineHeight: 25, fontWeight: '700' as const, fontFamily: fonts.bold },
  /** Titel van een lijstrij of kaart — 15/600. */
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const, fontFamily: fonts.semibold },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const, fontFamily: fonts.regular },
  /** Ondertitel/meta onder een rij. */
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, fontFamily: fonts.regular },
  /** Formulierlabel — 12,5/600 in de lichtste tekstkleur. */
  label: { fontSize: 12.5, lineHeight: 16, fontWeight: '600' as const, fontFamily: fonts.semibold },
  /** Sectiekop: klein, kapitaal, ruime letterafstand, in het groen. */
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.88, // .08em bij 11px
    textTransform: 'uppercase' as const,
    fontFamily: fonts.bold,
  },
} as const;

// ---------------------------------------------------------------------------
// Ruimte en hoeken
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/**
 * Het ontwerp gebruikt rondere hoeken dan de oude app: invoervelden en
 * zoekbalken staan op 14, kaarten op 16, groepen en modals op 18–20.
 */
export const radius = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  pill: 999,
};

export const ds = {
  // ── Merk ────────────────────────────────────────────────────────────────
  // Het ontwerp verfijnt het BossBase-groen bewust: `#22C55E` als actiekleur
  // met forest ink erop, en een donkerder `#15803D` voor groene TEKST (dat
  // haalt op wit de contrasteis die #1DDB62 niet haalt). Dit is de "bewust
  // verfijnde variant" waar de opdracht ruimte voor laat — het blijft
  // herkenbaar BossBase-groen, alleen leesbaar.
  green: '#22C55E',
  green600: '#16A34A',
  green700: '#15803D',
  green50: '#DCFCE7',
  green100: '#BBF7D0',
  /**
   * BossBase-zwart, exact zoals het dashboard (`--bb-black` / `--sb`, de
   * zijbalk en `theme-color`). Eerder stond hier een donkergroen (#0A2E1F);
   * dat kwam niet uit de huisstijl.
   */
  zwart: '#0D0D0D',
  /** Tekst en iconen óp een groen vlak — het dashboard gebruikt daar zwart.
   *  Constant in beide thema's: groen blijft groen, dus de tekst erop ook. */
  greenInk: '#0D0D0D',
  /**
   * Het vlak van de zwevende tabbalk en de donkere herokaarten. In light mode
   * het BossBase-zwart; in dark mode juist iets LICHTER dan de achtergrond, met
   * een zichtbare rand, anders verdwijnt de balk in de achtergrond.
   */
  barBg: '#0D0D0D',
  barBorder: 'transparent',

  // ── Vlakken ─────────────────────────────────────────────────────────────
  bg: '#F3F4F6',
  bgAlt: '#F1F3F5',
  card: '#FFFFFF',
  line: 'rgba(15,23,42,0.06)',
  lineStrong: 'rgba(15,23,42,0.16)',

  // ── Tekst ───────────────────────────────────────────────────────────────
  ink: '#0F172A',
  ink2: '#334155',
  muted: '#5B6472',
  muted2: '#6B7480',

  // ── Statuskleuren ───────────────────────────────────────────────────────
  // Eén betekenis per kleur, overal hetzelfde: grijs = concept, blauw =
  // onderweg, groen = goed, amber = verlopen, rood = te laat, paars =
  // afspraak/creditnota.
  statusDraftBg: '#E5E7EB',
  statusDraftFg: '#4B5563',
  statusSubmitBg: '#DBEAFE',
  statusSubmitFg: '#1D4ED8',
  statusApproveBg: '#DCFCE7',
  statusApproveFg: '#15803D',
  statusRejectBg: '#FEE2E2',
  statusRejectFg: '#B91C1C',
  statusWarnBg: '#FEF3C7',
  statusWarnFg: '#B45309',
  statusWarnStripe: '#F59E0B',
  /** Nieuw: afspraak en creditnota — paars, zodat ze niet met "goed" botsen. */
  statusInfoBg: '#EDE9FE',
  statusInfoFg: '#6D28D9',

  // ── Hoeken ──────────────────────────────────────────────────────────────
  rSm: 12,
  rMd: 16,
  rLg: 18,
  rXl: 22,

  // ── Ruimte ──────────────────────────────────────────────────────────────
  sp1: 4,
  sp2: 8,
  sp3: 12,
  sp4: 16,
  sp5: 20,
  sp6: 24,
} as const;

// ---------------------------------------------------------------------------
// Schaduwen
// ---------------------------------------------------------------------------

/**
 * Kaartschaduw. Het ontwerp houdt die heel licht — `0 2px 10px
 * rgba(10,46,31,.04)` — want de kaarten worden al door de rand en het grijze
 * vlak eromheen gescheiden. Een zwaardere schaduw maakt een lijst met tien
 * kaarten meteen onrustig.
 */
export const dsShadow = {
  shadowColor: '#0D0D0D',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

/** Zwevende elementen: tabbalk, modals, hero-kaart. */
export const dsShadowPop = {
  shadowColor: '#0D0D0D',
  shadowOpacity: 0.18,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
} as const;

/** De groene gloed onder een primaire knop of FAB. */
export const dsShadowGreen = {
  shadowColor: '#22C55E',
  shadowOpacity: 0.3,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
} as const;

// ---------------------------------------------------------------------------
// Light en dark
// ---------------------------------------------------------------------------
//
// Beide paletten delen exact dezelfde sleutels, zodat een scherm
// `const t = useTheme().colors` kan doen en `t.bg`, `t.card`, … overal werkt.
// De donkere waarden komen uit het `DARK`-blok van het ontwerp; waar het
// ontwerp geen donkere variant noemt (statuskleuren) is de regel van het
// ontwerp zelf aangehouden: lichte tekstkleur op een doorzichtig gekleurd vlak,
// zodat een badge ook op een donkere kaart leesbaar blijft.

export type ThemeColors = {
  [K in keyof typeof ds]: (typeof ds)[K] extends number ? number : string;
};

export const lightTheme: ThemeColors = ds;

export const darkTheme: ThemeColors = {
  ...ds,
  // Vlakken — op het BossBase-zwart, neutraal grijs (geen groene zweem).
  bg: '#0D0D0D',
  bgAlt: '#202020',
  card: '#171717',
  line: 'rgba(255,255,255,0.09)',
  lineStrong: 'rgba(255,255,255,0.18)',
  // Tekst
  ink: '#F5F5F5',
  ink2: '#D4D4D4',
  muted: '#A3A3A3',
  muted2: '#8F8F8F',
  // Groen: de actiekleur blijft gelijk, tekst en vlak worden lichter zodat ze
  // op een donkere achtergrond nog leesbaar zijn.
  green700: '#4ADE80',
  green50: 'rgba(34,197,94,0.16)',
  green100: 'rgba(34,197,94,0.24)',
  greenInk: '#0D0D0D',
  barBg: '#1F1F1F',
  barBorder: 'rgba(255,255,255,0.1)',
  // Statusbadges
  statusDraftBg: 'rgba(255,255,255,0.08)',
  statusDraftFg: '#B7BEC7',
  statusSubmitBg: 'rgba(59,130,246,0.18)',
  statusSubmitFg: '#93C5FD',
  statusApproveBg: 'rgba(34,197,94,0.16)',
  statusApproveFg: '#4ADE80',
  statusRejectBg: 'rgba(239,68,68,0.18)',
  statusRejectFg: '#FCA5A5',
  statusWarnBg: 'rgba(245,158,11,0.18)',
  statusWarnFg: '#FCD34D',
  statusInfoBg: 'rgba(139,92,246,0.18)',
  statusInfoFg: '#C4B5FD',
};

/**
 * De vier accentkleuren voor avatars en gekleurde icoonvlakken, in de volgorde
 * die het ontwerp aanhoudt (oranje, blauw, groen, amber). `tint(i)` kiest er
 * één op basis van een index, zodat dezelfde klant altijd dezelfde kleur heeft.
 */
export function tint(index: number, dark: boolean): { bg: string; fg: string } {
  const licht = [
    { bg: '#FFEDD5', fg: '#C2410C' },
    { bg: '#DBEAFE', fg: '#1D4ED8' },
    { bg: '#DCFCE7', fg: '#15803D' },
    { bg: '#FEF3C7', fg: '#B45309' },
  ];
  const donker = [
    { bg: 'rgba(249,115,22,0.18)', fg: '#FDBA74' },
    { bg: 'rgba(59,130,246,0.18)', fg: '#93C5FD' },
    { bg: 'rgba(34,197,94,0.16)', fg: '#4ADE80' },
    { bg: 'rgba(245,158,11,0.18)', fg: '#FCD34D' },
  ];
  const rij = dark ? donker : licht;
  return rij[Math.abs(index) % 4] as { bg: string; fg: string };
}
