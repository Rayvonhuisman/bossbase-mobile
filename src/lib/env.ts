/**
 * De Supabase-omgeving, één keer gelezen en meteen gecontroleerd.
 *
 * ── Waarom de verwijzingen hieronder letterlijk zo moeten staan ─────────────
 *
 * Expo vervangt tijdens het bundelen élke `process.env.EXPO_PUBLIC_X` door de
 * waarde van dat moment. Dat gebeurt door een Babel-plugin die naar de
 * BRONTEKST kijkt, niet naar wat de code doet. Alleen een statische puntnotatie
 * wordt herkend:
 *
 *     process.env.EXPO_PUBLIC_SUPABASE_URL      ✅ wordt ingebakken
 *     process.env['EXPO_PUBLIC_SUPABASE_URL']   ❌ blijft staan
 *     process.env[naam]                         ❌ blijft staan
 *     const { EXPO_PUBLIC_… } = process.env      ❌ blijft staan
 *
 * Dit bestand deed eerder `process.env[name]` met de naam als parameter. In
 * ontwikkeling viel dat niet op: de Metro-dev-server vult `process.env` bij het
 * starten met de inhoud van `.env`, dus in Expo Go werkte alles. In een
 * productiebundel bestaat die dev-server niet en is er geen `.env`; de lookup
 * gaf daar `undefined`, de controle hieronder wierp een fout tijdens het laden
 * van de module, en de app crashte nog vóór de router stond:
 *
 *     Error: Missing EXPO_PUBLIC_SUPABASE_URL
 *     TypeError: Cannot read property 'ErrorBoundary' of undefined   ← gevolg
 *
 * De waarden zelf staan als EAS-omgevingsvariabelen in environment
 * `production` (en lokaal in `.env`, dat niet in Git en niet in de EAS-upload
 * zit). Het buildprofiel `production` in `eas.json` verwijst met
 * `"environment": "production"` naar die omgeving; zonder die regel draait de
 * build zonder variabelen en is ook een correcte puntnotatie leeg.
 */

// Deze twee regels zijn het hele punt: statisch, voluit, niet samengesteld.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Ontbreekt er een waarde, dan stopt de app hier — bewust.
 *
 * Doorgaan met een lege URL levert een app op die inlogt, laadt en filtert
 * zonder ooit iets te vinden, en dat is niet te onderscheiden van "je hebt geen
 * werkbonnen". Een harde fout bij het opstarten wijst meteen de echte oorzaak
 * aan: de buildconfiguratie, niet de gebruiker.
 */
function vereist(waarde: string | undefined, naam: string): string {
  if (!waarde) {
    throw new Error(
      `Missing ${naam}. Copy .env.example to .env and set your Supabase credentials.`,
    );
  }
  return waarde;
}

export const env = {
  SUPABASE_URL: vereist(SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: vereist(SUPABASE_ANON_KEY, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
};
