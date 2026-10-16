/** App Store-compliance: accountverwijdering vindbaar, geen aankoopinformatie op iOS, web/Android ongewijzigd. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL('../' + pad, import.meta.url), 'utf8');
const { toonAankoopInfoVoor, aankoopTekstVoor, BEHEER_BUITEN_APP } = await import('../src/lib/aankoopRegels.ts');
const { readonlyTekst, READONLY_TEKSTEN_IOS } = await import('../src/lib/permissions.ts');

test('aankoopinformatie: iOS niet, web en Android wel', () => {
  assert.equal(toonAankoopInfoVoor('ios'), false);
  assert.equal(toonAankoopInfoVoor('web'), true);
  assert.equal(toonAankoopInfoVoor('android'), true);
  assert.equal(aankoopTekstVoor('ios', 'a', 'b'), 'b');
  assert.equal(aankoopTekstVoor('android', 'a', 'b'), 'a');
  assert.equal(BEHEER_BUITEN_APP, 'Je abonnement wordt buiten de app beheerd.');
});

test('iOS-teksten: geen prijzen, geen oproep tot kopen, geen dashboard-/Stripe-verwijzing', () => {
  for (const t of Object.values(READONLY_TEKSTEN_IOS)) {
    const tekst = t.titel + ' ' + t.uitleg;
    assert.doesNotMatch(tekst, /€|kies|kiezen|betaalgegevens|dashboard|stripe|upgrade|gratis/i, tekst);
  }
  // Web blijft de oorspronkelijke uitleg tonen.
  assert.match(readonlyTekst('proefperiode_verlopen', 'web').uitleg, /zodra je een abonnement kiest/);
  assert.doesNotMatch(readonlyTekst('proefperiode_verlopen', 'ios').uitleg, /kies/);
});

test('Abonnementstab: prijzen, actie, modules-prijzen en beheerknop alleen buiten iOS', () => {
  const bron = lees('src/components/instellingen/AbonnementTab.tsx');
  assert.match(bron, /const aankoop = toonAankoopInfo\(\);/);
  assert.match(bron, /aankoop\s*\?\s*`€ \$\{maandbedrag/);
  assert.match(bron, /aankoop && MODULES\[k\]/);
  assert.match(bron, /aankoop && stand\.billingInterval === 'jaar' && stand\.welkomstactie/);
  assert.match(bron, /\{!aankoop \? \([\s\S]*BEHEER_BUITEN_APP[\s\S]*\) : \(/);
  // De dashboardknop zit alleen in de niet-iOS-tak.
  const iosTak = bron.slice(bron.indexOf('{!aankoop ? ('), bron.indexOf(') : (', bron.indexOf('{!aankoop ? (')));
  assert.doesNotMatch(iosTak, /openDashboard|Button/);
});

test('geen externe abonnementslink of pakketkeuze op iOS', () => {
  assert.match(lees('src/components/instellingen/TemplatesTab.tsx'), /toonAankoopInfo\(\)\s*\?\s*\[[\s\S]*Naar het dashboard[\s\S]*\]\s*:\s*\[\{ text: 'Sluiten'/);
  assert.match(lees('app/(onboarding)/index.tsx'), /toonAankoopInfo\(\) \? '\/\(onboarding\)\/pakket' : '\/\(onboarding\)\/company'/);
  for (const f of ['app/(more)/team.tsx', 'app/(more)/invoices.tsx']) {
    const bron = lees(f);
    assert.match(bron, /aankoopTekst\(/, f);
  }
  // Nergens in de app een Stripe-checkout of aankoop-URL.
  for (const f of ['src/components/instellingen/AbonnementTab.tsx', 'src/lib/dashboardLink.ts', 'app/(more)/settings.tsx']) {
    assert.doesNotMatch(lees(f), /checkout\.stripe|buy\.stripe|billing\.stripe/i, f);
  }
});

test('accountverwijdering: vindbaar, rolafhankelijk, eigenaar kan niet deactiveren in plaats van sluiten', () => {
  const tab = lees('src/components/instellingen/ProfielTab.tsx');
  assert.match(tab, /<Kaart titel="Account verwijderen">/);
  // Eigenaar: geen deactiveerknop; medewerker/beheerder wel (na laden eigenaar).
  assert.match(tab, /zegtBedrijfOp \? \([\s\S]*?\) : eigenaarId !== undefined \? \(\s*<Button label="Account deactiveren"/);
  // Op iOS geen dashboardlink die op een telefoon niet opent.
  assert.match(tab, /Platform\.OS === 'web' \? \(\s*<Button\s*label="Bedrijf sluiten op het dashboard"/);
  const profiel = lees('app/profile/index.tsx');
  assert.match(profiel, /title: 'Account verwijderen'[\s\S]*router\.push\('\/settings\?tab=profiel'\)/);
});

test('geen echte verwijdering in tests: de RPC zit alleen achter de bevestiging met VERWIJDEREN', () => {
  const tab = lees('src/components/instellingen/ProfielTab.tsx');
  assert.match(tab, /VERWIJDEREN/);
  assert.match(lees('src/services/profileService.ts'), /rpc\('delete_own_account'\)/);
});

test('PDOK: alleen zoektekst en lookup-id naar api.pdok.nl, geen BossBase-opslag', () => {
  const bron = lees('src/lib/adresZoeken.ts');
  assert.match(bron, /https:\/\/api\.pdok\.nl\/bzk\/locatieserver\/search\/v3_1\/suggest/);
  assert.match(bron, /\?q=\$\{encodeURIComponent\(q\)\}&fq=type:adres&rows=8/);
  assert.doesNotMatch(bron, /supabase|AsyncStorage|localStorage/);
  assert.match(lees('vercel.json'), /connect-src[^"]*https:\/\/api\.pdok\.nl/);
});
