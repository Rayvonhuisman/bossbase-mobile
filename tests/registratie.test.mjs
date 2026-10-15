/** Registratie: dezelfde regels, metadata en meldingen als het dashboard (BbAuth.jsx / authService.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const r = await import('../src/lib/registratie.ts');

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');

test('wachtwoord: 8 tekens, hoofdletter, cijfer en speciaal teken', () => {
  assert.equal(r.wachtwoordGeldig('Abcdef1!'), true);
  assert.equal(r.wachtwoordGeldig('abcdef1!'), false, 'geen hoofdletter');
  assert.equal(r.wachtwoordGeldig('Abcdefg!'), false, 'geen cijfer');
  assert.equal(r.wachtwoordGeldig('Abcdefg1'), false, 'geen speciaal teken');
  assert.equal(r.wachtwoordGeldig('Ab1!'), false, 'te kort');
  assert.deepEqual(
    r.WACHTWOORD_EISEN.map((e) => e.label),
    ['Minimaal 8 tekens', 'Minimaal 1 hoofdletter', 'Minimaal 1 cijfer', 'Minimaal 1 speciaal teken'],
  );
});

test('accountstap: meldingen per veld, gelijk aan validateAccount', () => {
  const goed = { fullName: 'Marco', email: 'marco@veldhuis.nl', password: 'Abcdef1!', password2: 'Abcdef1!' };
  assert.deepEqual(r.accountFouten(goed), {});
  assert.deepEqual(r.accountFouten({ fullName: '  ', email: 'x', password: '', password2: '' }), {
    fullName: 'Vul je volledige naam in.',
    email: 'Vul een geldig e-mailadres in.',
    password: 'Vul een wachtwoord in.',
    password2: 'Herhaal je wachtwoord.',
  });
  assert.equal(
    r.accountFouten({ ...goed, password: 'kort', password2: 'kort' }).password,
    'Vul een wachtwoord in dat aan alle vereisten voldoet.',
  );
  assert.equal(r.accountFouten({ ...goed, password2: 'Abcdef1?' }).password2, 'Wachtwoorden komen niet overeen.');
  assert.equal(r.heeftFouten(r.accountFouten(goed)), false);
});

test('bedrijfsstap: naam en telefoon verplicht, branche en KvK niet', () => {
  assert.deepEqual(r.bedrijfFouten({ companyName: 'Veldhuis', phone: '06-12345678', kvk: '', branche: '' }), {});
  const f = r.bedrijfFouten({ companyName: ' ', phone: '', kvk: '', branche: '' });
  assert.equal(f.companyName, 'Vul je bedrijfsnaam in.');
  assert.equal(f.phone, 'Vul je telefoonnummer in.');
});

test('telefoon: zelfde regels als telefoonFout van het dashboard', () => {
  for (const goed of [
    '06-12345678',
    '0612345678',
    '020 - 123 45 67',
    '+31 6 12345678',
    '0031 6 12345678',
    '+31 (0)6 12345678',
    '+32 470 12 34 56',
  ]) {
    assert.equal(r.telefoonFout(goed), '', goed);
  }
  assert.equal(r.telefoonFout('+31 6 1234'), 'Dit is geen geldig Nederlands nummer.');
  assert.match(r.telefoonFout('06-abc'), /alleen cijfers/);
  assert.match(r.telefoonFout('061234'), /^Vul een geldig telefoonnummer in/);
});

test('metadata voor signUp: zelfde sleutels als registerWithEmail', () => {
  const m = r.registratieMetadata({
    email: 'marco@veldhuis.nl',
    password: 'Abcdef1!',
    fullName: ' Marco Veldhuis ',
    companyName: 'Veldhuis Schilderwerken ',
    phone: ' 06-12345678 ',
    kvk: '',
    branche: 'Schilder',
    pakket: 'team',
  });
  assert.deepEqual(m, {
    full_name: 'Marco Veldhuis',
    company_name: 'Veldhuis Schilderwerken',
    phone: '06-12345678',
    kvk: null,
    branche: 'Schilder',
    gekozen_pakket: 'team',
  });
  // Geen keuze of iets anders = groei, zoals het dashboard.
  for (const pakket of ['', null, 'groei']) {
    assert.equal(
      r.registratieMetadata({ ...m, fullName: 'a', companyName: 'b', phone: '', kvk: '', branche: '', pakket })
        .gekozen_pakket,
      'groei',
    );
  }
  assert.equal(
    r.registratieMetadata({ fullName: 'a', companyName: 'b', phone: '', kvk: '', branche: '', pakket: null }).phone,
    null,
  );
});

test('branches en pakketten gelijk aan het dashboard', () => {
  assert.deepEqual(
    [...r.BRANCHES],
    [
      'Schilder',
      'Hovenier',
      'Aannemer',
      'Kozijnen',
      'Installateur',
      'Dakdekker',
      'Loodgieter',
      'Elektricien',
      'Schoonmaak',
      'Anders',
    ],
  );
  assert.deepEqual(
    r.PAKKETTEN.map((p) => p.id),
    ['groei', 'team'],
  );
});

test('code: alleen cijfers, maximaal zes', () => {
  assert.equal(r.schoneCode('12 34-56 78'), '123456');
  assert.equal(r.schoneCode('abc'), '');
  assert.equal(r.OPNIEUW_NA_SECONDEN, 60);
});

test('verify-code: antwoorden vertalen zoals EmailVerificationScreen', () => {
  assert.deepEqual(r.verificatieUitkomst({ success: true, companyId: 'x' }), { ok: true });
  assert.deepEqual(r.verificatieUitkomst({ success: true, alreadyVerified: true }), { ok: true });
  assert.deepEqual(
    r.verificatieUitkomst({
      success: false,
      code: 'MISMATCH',
      remaining: 3,
      error: 'Code is onjuist. Nog 3 pogingen.',
    }),
    { ok: false, melding: 'Code is onjuist. Nog 3 pogingen.', codeLeegmaken: false },
  );
  for (const code of ['EXPIRED', 'TOO_MANY', 'NO_CODE']) {
    const u = r.verificatieUitkomst({ success: false, code, error: 'x' });
    assert.equal(u.ok, false);
    assert.equal(u.codeLeegmaken, true, code);
  }
  assert.deepEqual(r.verificatieUitkomst(null), { ok: false, melding: 'Code is onjuist.', codeLeegmaken: false });
  assert.equal(r.verificatieUitkomst({ success: false, error: 'Ongeldige sessie' }).melding, 'Ongeldige sessie');
});

test('wacht op verificatie: profiel zonder bedrijf en zonder bevestiging', () => {
  assert.equal(r.wachtOpVerificatie({ company_id: null, email_verified_at: null }), true);
  assert.equal(r.wachtOpVerificatie({ company_id: 'c1', email_verified_at: null }), false, 'uitgenodigd teamlid');
  assert.equal(r.wachtOpVerificatie({ company_id: null, email_verified_at: '2026-10-15' }), false);
  assert.equal(r.wachtOpVerificatie(null), false);
});

test('foutvertaling: gelijk aan vertaalAuthFout', () => {
  assert.equal(r.vertaalAuthFout('User already registered'), 'Er bestaat al een account met dit e-mailadres');
  assert.equal(r.vertaalAuthFout('Email rate limit exceeded'), 'Te veel pogingen. Probeer het later opnieuw');
  assert.equal(r.vertaalAuthFout('Unable to validate email address: invalid format'), 'Vul een geldig e-mailadres in');
  assert.equal(r.vertaalAuthFout('Something failed badly'), 'Er ging iets mis. Probeer het opnieuw');
  assert.equal(r.vertaalAuthFout('Al Nederlands'), 'Al Nederlands');
  assert.equal(r.vertaalAuthFout(''), 'Er ging iets mis. Probeer het opnieuw');
});

test('juridische links: dezelfde pagina’s als het dashboard', () => {
  assert.deepEqual(Object.values(r.JURIDISCH), [
    'https://www.bossbase.nl/voorwaarden',
    'https://www.bossbase.nl/verwerkersovereenkomst',
    'https://www.bossbase.nl/privacy',
  ]);
});

test('signUp: metadata, akkoord met één herhaling, dan code aanvragen; geen bedrijf aanmaken', () => {
  const bron = lees('../src/providers/AuthProvider.tsx');
  assert.match(bron, /options: \{ data: registratieMetadata\(invoer\) \}/);
  assert.match(bron, /legAkkoordVast\(\)\s*\.catch\(\(\) => legAkkoordVast\(\)\)\s*\.catch\(\(\) => \{\}\)/);
  assert.match(bron, /await vraagVerificatiecodeAan\(\)\.catch\(\(\) => \{\}\)/);
  assert.ok(bron.indexOf('legAkkoordVast()') < bron.indexOf('vraagVerificatiecodeAan()'), 'eerst akkoord, dan code');
  assert.doesNotMatch(bron, /provision_account|from\('companies'\)\.insert/);
  // Wachten op de code is een eigen status, geen foutscherm.
  assert.match(bron, /kind === 'awaiting_verification'[\s\S]{0,200}setStatus\('needs-verification'\)/);
});

test('service: de drie Edge Functions van het dashboard', () => {
  const bron = lees('../src/services/registratieService.ts');
  assert.match(bron, /invoke\('akkoord-vastleggen'\)/);
  assert.match(bron, /invoke\('request-verification-code'\)/);
  assert.match(bron, /invoke\('verify-code', \{ body: \{ code \} \}\)/);
  // 4xx-antwoord van verify-code uitlezen voor de specifieke melding.
  assert.match(bron, /context\?\.json\(\)/);
});

test('layouts: onbevestigde sessie gaat naar het codescherm', () => {
  assert.match(lees('../app/(tabs)/_layout.tsx'), /needs-verification[\s\S]{0,80}\/\(onboarding\)\/verify/);
  const onb = lees('../app/(onboarding)/_layout.tsx');
  assert.match(onb, /needs-verification/);
  assert.match(onb, /<Stack.Screen name="verify"/);
  assert.match(onb, /<Stack.Screen name="pakket"/);
  // Geen voorwaarden-vinkje dat standaard aan staat: de tekst bij de knop is het akkoord, zoals het dashboard.
  const account = lees('../app/(onboarding)/account.tsx');
  assert.doesNotMatch(account, /useState\(true\)/);
  assert.match(account, /Door een account aan te maken ga je akkoord met de/);
});
