// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/btwRegime.js
// Dashboardcommit: 4f36bec
// Bijwerken: node scripts/pdf-opbouw-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie; tests/pdfOpbouw.test.mjs
// vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// ─────────────────────────────────────────────────────────────────────────────
// BTW-regime op een offerte- of factuurregel.
//
// Alleen een percentage is niet genoeg: 0% kan vrijgesteld of verlegd zijn.
// Op de aangifte komen ze allebei in rubriek 1e, maar in de boekhouding lopen ze
// verschillend — verlegd via de balansrekeningen voor verlegde btw, vrijgesteld
// niet. Zonder regime moest de koppeling raden, en die raadde fout.
//
// Vier regimes: dat is wat ambachtelijke ondernemers gebruiken. Export binnen en
// buiten de EU laten we bewust weg — die komen bij deze doelgroep niet voor en
// elke extra keuze is een kans op een verkeerde.
// ─────────────────────────────────────────────────────────────────────────────

export const BTW_REGIMES = [
  {
    value: 'normaal',
    pct: 21,
    label: '21% — normaal',
    kort: null,
    uitleg: 'Het gewone tarief. Geldt voor verreweg de meeste werkzaamheden.',
  },
  {
    value: 'verlaagd',
    pct: 9,
    label: '9% — verlaagd',
    kort: null,
    uitleg: 'Het lage tarief. Denk aan schilder- en stukadoorswerk aan woningen ouder dan twee jaar, of het aanbrengen van isolatie.',
  },
  {
    value: 'vrijgesteld',
    pct: 0,
    label: '0% — vrijgesteld',
    kort: 'Geen btw van toepassing',
    uitleg: 'Over dit werk is wettelijk géén btw verschuldigd — door niemand. Dat geldt maar voor een beperkt aantal diensten, bijvoorbeeld in de zorg of het onderwijs, en bij verhuur van onroerend goed. Twijfel je? Dan is het waarschijnlijk niet vrijgesteld.',
  },
  {
    value: 'verlegd',
    pct: 0,
    label: '0% — btw verlegd',
    kort: 'Je klant draagt de btw af',
    uitleg: 'Er ís btw verschuldigd, maar jouw opdrachtgever draagt hem af in plaats van jij. Dit speelt bij onderaanneming in de bouw. Vermeld op de factuur "btw verlegd" plus het btw-nummer van je opdrachtgever.',
  },
];

export const DEFAULT_REGIME = 'normaal';

// De verwarring zit tussen deze twee: allebei 0% op de factuur, maar fiscaal
// iets heel anders. Deze tekst staat onder de regellijst zodra een van beide
// gekozen is.
export const NUL_TARIEF_UITLEG =
  'Let op het verschil tussen vrijgesteld en verlegd. Bij vrijgesteld is er helemaal geen btw '
  + 'verschuldigd — dat geldt maar voor een paar soorten diensten. Bij verlegd is er wél btw, '
  + 'maar draagt je opdrachtgever die af; dat is de normale gang van zaken bij onderaanneming '
  + 'in de bouw. Weet je het niet zeker, vraag het je boekhouder: de verkeerde keuze komt terug '
  + 'in je aangifte.';

// Verlegd mag niet samen met belaste regels op één factuur — SnelStart weigert
// dat (BOE-0062), en fiscaal klopt het ook niet: bij verlegging draagt de
// opdrachtgever de btw af, dan kan er geen belaste regel naast staan.
export const VERLEGD_MENG_WAARSCHUWING =
  'Verlegde btw kan niet samen met belaste regels op één factuur. Zet de verlegde werkzaamheden '
  + 'op een aparte factuur, anders wordt hij door je boekhouding geweigerd.';

export const regimeCfg = regime =>
  BTW_REGIMES.find(r => r.value === regime) || BTW_REGIMES[0];

// Opgeslagen percentage → regime. Alleen voor regels van vóór de invoering van
// btw_regime en voor flows die met kale percentages werken (werkbonmateriaal).
// 0% valt terug op vrijgesteld: dat is de onschuldigste aanname — vrijgesteld
// mag namelijk wél naast belaste regels staan, verlegd niet.
export function regimeVanPct(pct) {
  const p = Number(pct);
  if (p === 9) return 'verlaagd';
  if (p === 0) return 'vrijgesteld';
  return 'normaal';
}

// Regime → percentage. 'anders' bestaat alleen in de UI (oude regels met een
// afwijkend tarief) en houdt zijn eigen percentage.
export const pctVanRegime = (regime, huidigPct = 21) =>
  regime === 'anders' ? (Number(huidigPct) || 0) : regimeCfg(regime).pct;

// Wat er in de kolom btw_regime terechtkomt. 'anders' is geen geldig regime in
// de database: zo'n regel is gewoon normaal belast, tegen een afwijkend tarief.
export const regimeVoorOpslag = regime =>
  (regime === 'anders' ? 'normaal' : (regime || DEFAULT_REGIME));

// Keuzelijst voor één regel. Een regel met een afwijkend percentage (oude data,
// bijvoorbeeld 6%) houdt zijn eigen optie, zodat openen-en-opslaan het bedrag
// niet stilzwijgend verandert.
export function regimeOpties(huidigPct) {
  const opts = BTW_REGIMES.map(r => ({ value: r.value, label: r.label }));
  const p = Number(huidigPct);
  if (Number.isFinite(p) && ![21, 9, 0].includes(p)) {
    opts.push({ value: 'anders', label: `${p}% — anders` });
  }
  return opts;
}

// Regime van een UI-regel bepalen: expliciet gezet regime wint, anders afleiden
// uit het percentage (oude data), en een afwijkend percentage wordt 'anders'.
export function regimeVanRegel(r) {
  if (r?.btwRegime) return r.btwRegime;
  const pct = Number(r?.btw === 'anders' ? r?.btwAnders : r?.btw);
  if (Number.isFinite(pct) && ![21, 9, 0].includes(pct)) return 'anders';
  return regimeVanPct(pct);
}

/** Staat er verlegde btw naast belaste regels? Dan wordt de boeking geweigerd. */
export function heeftVerlegdConflict(regels = []) {
  const regimes = regels.map(regimeVanRegel);
  return regimes.includes('verlegd') && regimes.some(r => r === 'normaal' || r === 'verlaagd' || r === 'anders');
}
