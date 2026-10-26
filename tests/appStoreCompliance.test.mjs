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

test('bestanden: opslag vol zonder oproep tot een groter pakket op iOS', () => {
  assert.match(lees('src/services/bestandenService.ts'), /OPSLAG_VOL_TEKST = aankoopTekst\(/);
  assert.match(lees('src/components/BestandenBlok.tsx'), /aankoopTekst\('verwijder bestanden of kies een groter pakket\.', 'verwijder bestanden\.'\)/);
});

test('accountverwijdering: vindbaar en echt (Edge Function account-verwijderen), geen deactiveren of mailverzoek meer', () => {
  // Zonder commentaar: de uitleg mag zeggen dat de app vroeger deactiveerde.
  const tab = lees('src/components/instellingen/ProfielTab.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(tab, /<AccountVerwijderen onUitgelogd=\{[^}]*\} \/>/);
  assert.doesNotMatch(tab, /deactiveer|delete_own_account|mailto:|openDashboard/);
  const kaart = lees('src/components/instellingen/AccountVerwijderen.tsx');
  assert.match(kaart, /<Kaart titel="Account verwijderen">/);
  for (const knop of ['Account verwijderen', 'Eigendom overdragen', 'Bedrijf verwijderen', 'Verwijdering annuleren', 'Accepteren', 'Weigeren']) {
    assert.match(kaart, new RegExp(`label="${knop}"`), knop);
  }
  assert.match(lees('src/services/accountVerwijderenService.ts'), /functions\.invoke\('account-verwijderen'/);
  const profiel = lees('app/profile/index.tsx');
  assert.match(profiel, /title: 'Account verwijderen'[\s\S]*router\.push\('\/settings\?tab=profiel'\)/);
});

test('geen echte verwijdering zonder wachtwoord en bevestiging; geen ids of wachtwoord naar de functie', () => {
  const kaart = lees('src/components/instellingen/AccountVerwijderen.tsx');
  // Elke ingrijpende actie begint met opnieuw aanmelden.
  assert.match(kaart, /const metWachtwoord = [\s\S]*?await bevestigMetWachtwoord\(wachtwoord\)/);
  for (const fn of ['lidVerwijderen', 'overdragen', 'bedrijfVerwijderen']) {
    assert.match(kaart, new RegExp(`const ${fn} = \\(\\) =>\\s*save\\(\\(\\) =>\\s*metWachtwoord\\(`), fn);
  }
  assert.match(kaart, /submitDisabled=\{!wachtwoord \|\| !bevestigingKlopt\(bevestiging\)\}/);
  assert.match(kaart, /bedrijfsnaamKlopt\(bevestiging, status\.bedrijfsnaam\)/);
  const dienst = lees('src/services/accountVerwijderenService.ts');
  assert.doesNotMatch(dienst, /user_id|company_id/);
  // Wat er per actie meegaat: alleen sleutel, ontvanger, overdracht-id en bevestiging.
  const velden = [...kaart.matchAll(/(?:verwijderActie(?:<[^>]*>)?|kort)\(\s*'[a-z_]+',\s*\{([^}]*)\}/g)]
    .flatMap((m) => m[1].split(',').map((v) => v.trim().split(':')[0].trim()).filter(Boolean));
  assert.ok(velden.length >= 6, String(velden));
  for (const v of velden) assert.ok(['sleutel', 'naar', 'id', 'bevestiging'].includes(v), v);
  // Het wachtwoord gaat alleen naar Supabase Auth, niet naar de functie.
  assert.match(dienst, /signInWithPassword\(\{ email: user\.email, password: wachtwoord \}\)/);
  assert.doesNotMatch(dienst, /invoke\([^)]*wachtwoord/);
  assert.doesNotMatch(kaart, /verwijderActie[^;]*wachtwoord/);
  assert.doesNotMatch(dienst, /service_role|SERVICE_ROLE/);
});

test('PDOK: alleen zoektekst en lookup-id naar api.pdok.nl, geen BossBase-opslag', () => {
  const bron = lees('src/lib/adresZoeken.ts');
  assert.match(bron, /https:\/\/api\.pdok\.nl\/bzk\/locatieserver\/search\/v3_1\/suggest/);
  assert.match(bron, /\?q=\$\{encodeURIComponent\(q\)\}&fq=type:adres&rows=8/);
  assert.doesNotMatch(bron, /supabase|AsyncStorage|localStorage/);
  assert.match(lees('vercel.json'), /connect-src[^"]*https:\/\/api\.pdok\.nl/);
});
