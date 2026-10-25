/**
 * Werkbon laten ondertekenen (per mail en ter plekke) en de Wkb-waarschuwing:
 * dezelfde verzoeken als het dashboard.
 *
 * Beide kanten draaien tegen dezelfde nep-Supabase-client, die elke aanroep
 * vastlegt (Edge Function, insert, update) en niets verstuurt. Daarna moeten de
 * vastgelegde verzoeken van app en dashboard gelijk zijn — tot op de HTML van
 * de mail. Staat de dashboardrepo niet op deze machine, dan worden die tests
 * overgeslagen (met melding).
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardLader } from './hulp/dashboardLader.mjs';

const V = await import('../src/lib/werkbonVersturen.ts');
const M = await import('../src/lib/mail/mailTemplate.ts');
const lader = dashboardLader();

const BEDRIJF = { name: 'TEST Bouw & Zn', reply_to_email: 'antwoord@test.nl', email: 'info@test.nl' };

/** Nep-client: legt elke aanroep vast, antwoordt met vaste gegevens. */
function nepClient() {
  const log = [];
  const tabel = (naam) => {
    const op = { tabel: naam, acties: [] };
    const b = {
      select: (...a) => (op.acties.push(['select', ...a]), b),
      insert: (r) => (op.acties.push(['insert', r]), b),
      update: (r) => (op.acties.push(['update', r]), b),
      eq: (...a) => (op.acties.push(['eq', ...a]), b),
      is: (...a) => (op.acties.push(['is', ...a]), b),
      order: () => b,
      maybeSingle: () => b,
      single: () => b,
      then: (ok, nee) => {
        log.push(op);
        let data = null;
        if (naam === 'companies') data = BEDRIJF;
        if (naam === 'profiles') data = { company_id: 'bedrijf-1' };
        if (naam === 'werkbon_notities') data = { id: 'notitie-1', note: 'x' };
        return Promise.resolve({ data, error: null }).then(ok, nee);
      },
    };
    return b;
  };
  return {
    log,
    from: tabel,
    functions: {
      invoke: async (naam, { body }) => {
        log.push({ functie: naam, body });
        return { data: { success: true }, error: null };
      },
    },
    auth: { getUser: async () => ({ data: { user: { id: 'gebruiker-1' } } }) },
  };
}

/**
 * Tijdstippen gelijktrekken (die verschillen per aanroep) en sorteren: het
 * mailarchief wordt zonder wachten bijgewerkt, dus de volgorde daarvan ten
 * opzichte van de werkbonupdate zegt niets.
 */
const normaal = (log) =>
  log
    .map((o) => JSON.stringify(o).replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/g, 'TIJD'))
    .sort()
    .map((s) => JSON.parse(s));

const werkbonRij = {
  id: 'wb-1',
  nummer: 'WB-042',
  titel: 'Dakgoot <vervangen> & "lood"',
  sign_token: '11111111-2222-3333-4444-555555555555',
  customer_id: 'klant-1',
};
const dashWerkbon = { id: 'wb-1', nummer: 'WB-042', titel: werkbonRij.titel, signToken: werkbonRij.sign_token, customerId: 'klant-1' };
const klant = { name: 'Fam. de Vries' };
const bedrijf = { name: 'TEST Bouw & Zn', logoUrl: '', brandingColor: '#F5C400' };

test('mailTemplate (zakelijk) en mailButton gelijk aan het dashboard', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const D = await lader.importeer('src/utils/mailTemplate.js');
  const gevallen = [
    { title: 'Hallo <b>', body: '<p>x</p>', companyName: 'Bedrijf & Co' },
    {
      title: 'Met logo',
      preheader: 'voor',
      body: '<p>y</p>',
      buttonText: 'Klik',
      buttonUrl: 'https://a.nl/?q=1&b=2',
      footerText: 'voet <i>noot</i>',
      companyName: 'X',
      logoUrl: 'https://logo.nl/l.png',
      brandColor: '#123456',
    },
    { title: 't', body: 'b', companyName: 'Y', logoUrl: 'javascript:alert(1)', brandColor: '#ffeeaa' },
  ];
  for (const g of gevallen) assert.equal(M.mailTemplate(g), D.mailTemplate(g));
  assert.equal(M.mailButton('Teken', 'https://x.nl', '#fff'), D.mailButton('Teken', 'https://x.nl', '#fff'));
  assert.equal(M.mailButton('Teken', 'https://x.nl'), D.mailButton('Teken', 'https://x.nl'));
});

test('per mail ter ondertekening: zelfde send-email, mailarchief en werkbonupdate', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  // werkbonSignUrl leest window.location.origin: het dashboard draait op
  // dashboard.bossbase.nl (sinds de domeinsplitsing van 26-10-2026).
  globalThis.window = { location: { origin: 'https://dashboard.bossbase.nl' } };
  const S = await lader.importeer('src/services/werkbonOndertekenenService.js');

  // De bijlage bouwt het dashboard in de browser; in Node lukt dat niet en
  // gaat de mail zonder. De app krijgt een bouwer die ook faalt, zodat we
  // dezelfde route vergelijken. (De PDF zelf: scripts/vergelijk-werkbon-pdf.mjs.)
  const dash = nepClient();
  globalThis.__bbSupabase = dash;
  await S.verstuurWerkbonTerOndertekening({
    werkbon: dashWerkbon,
    email: ' klant@test.nl ',
    detail: {},
    customer: klant,
    company: bedrijf,
  });
  await new Promise((r) => setTimeout(r, 10));

  const app = nepClient();
  const res = await V.verstuurTerOndertekening(app, {
    werkbon: werkbonRij,
    email: ' klant@test.nl ',
    companyId: 'bedrijf-1',
    customer: klant,
    company: bedrijf,
    maakPdfBase64: async () => {
      throw new Error('geen pdf in deze test');
    },
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(res.link, 'https://dashboard.bossbase.nl/werkbon/11111111-2222-3333-4444-555555555555');

  // Het dashboard zoekt company_id via het profiel op (withCompanyId); de app
  // heeft hem al. Die extra profielquery laten we buiten de vergelijking.
  const zonderProfiel = (log) => log.filter((o) => o.tabel !== 'profiles');
  assert.deepEqual(normaal(zonderProfiel(app.log)), normaal(zonderProfiel(dash.log)));
  const mail = app.log.find((o) => o.functie === 'send-email');
  assert.equal(mail.body.from_name, BEDRIJF.name);
  assert.equal(mail.body.reply_to, BEDRIJF.reply_to_email);
  assert.match(mail.body.html, /Dakgoot &lt;vervangen&gt; &amp; &quot;lood&quot;/);
  delete globalThis.window;
});

test('per mail: met bijlage gaat de PDF mee onder dezelfde naam', async () => {
  const app = nepClient();
  await V.verstuurTerOndertekening(app, {
    werkbon: werkbonRij,
    email: 'klant@test.nl',
    companyId: 'bedrijf-1',
    customer: klant,
    company: bedrijf,
    maakPdfBase64: async () => 'QUJD',
  });
  const mail = app.log.find((o) => o.functie === 'send-email');
  assert.deepEqual(mail.body.attachments, [{ filename: 'Werkbon-WB-042.pdf', content: 'QUJD' }]);
});

test('per mail: ongeldig adres of geen token geeft een leesbare fout en verstuurt niets', async () => {
  const app = nepClient();
  const basis = { werkbon: werkbonRij, companyId: 'b', customer: klant, company: bedrijf, maakPdfBase64: async () => '' };
  await assert.rejects(V.verstuurTerOndertekening(app, { ...basis, email: '' }), /Vul een e-mailadres in/);
  await assert.rejects(V.verstuurTerOndertekening(app, { ...basis, email: 'geen-adres' }), /geen geldig e-mailadres/);
  await assert.rejects(
    V.verstuurTerOndertekening(app, { ...basis, email: 'a@b.nl', werkbon: { ...werkbonRij, sign_token: null } }),
    /nog geen ondertekenlink/,
  );
  assert.equal(app.log.length, 0);
});

test('Wkb-waarschuwing: zelfde mail, archief en vastlegging als het dashboard', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const S = await lader.importeer('src/services/werkbonOndertekenenService.js');
  for (const gevolg of ['Lekkage op termijn\nen schade', '']) {
    const dash = nepClient();
    globalThis.__bbSupabase = dash;
    await S.verstuurWaarschuwing({
      werkbon: dashWerkbon,
      notitie: { id: 'notitie-1' },
      constatering: ' Houtrot <dakrand>\nachterzijde ',
      gevolg,
      email: 'klant@test.nl',
      customer: klant,
      company: bedrijf,
    });
    await new Promise((r) => setTimeout(r, 10));
    const app = nepClient();
    await V.verstuurWaarschuwing(app, {
      werkbon: werkbonRij,
      notitieId: 'notitie-1',
      constatering: ' Houtrot <dakrand>\nachterzijde ',
      gevolg,
      email: 'klant@test.nl',
      companyId: 'bedrijf-1',
      customer: klant,
      company: bedrijf,
      kolommen: '*, profiles(full_name)',
    });
    await new Promise((r) => setTimeout(r, 10));
    const zonderProfiel = (log) => log.filter((o) => o.tabel !== 'profiles');
    assert.deepEqual(normaal(zonderProfiel(app.log)), normaal(zonderProfiel(dash.log)));
    const { html } = V.waarschuwingMail({ werkbon: werkbonRij, constatering: 'a', gevolg, customer: klant, company: bedrijf });
    assert.deepEqual(html, S.bouwWaarschuwingMail({ werkbon: dashWerkbon, constatering: 'a', gevolg, customer: klant, company: bedrijf }).html);
  }
});

test('Wkb-waarschuwing: zonder constatering niets versturen', async () => {
  const app = nepClient();
  await assert.rejects(
    V.verstuurWaarschuwing(app, {
      werkbon: werkbonRij,
      notitieId: 'n',
      constatering: '  ',
      gevolg: 'x',
      email: 'a@b.nl',
      companyId: 'b',
      customer: klant,
      company: bedrijf,
    }),
    /Beschrijf wat je hebt geconstateerd/,
  );
  assert.equal(app.log.length, 0);
});

test('ondertekenen ter plekke: zelfde body naar sign-werkbon, waarschuwingen in de melding', async (t) => {
  const app = nepClient();
  const invoer = { signToken: werkbonRij.sign_token, name: 'Jan', email: 'jan@test.nl', signatureDataUrl: 'data:image/png;base64,iVBOR' };
  await V.signWerkbon(app, invoer);
  if (lader) {
    const S = await lader.importeer('src/services/werkbonOndertekenenService.js');
    const dash = nepClient();
    globalThis.__bbSupabase = dash;
    await S.signWerkbon(invoer);
    assert.deepEqual(app.log, dash.log);
  } else t.diagnostic('dashboardrepo niet gevonden; alleen de app gecontroleerd');
  assert.deepEqual(app.log[0], {
    functie: 'sign-werkbon',
    body: { sign_token: werkbonRij.sign_token, name: 'Jan', email: 'jan@test.nl', signature_data_url: 'data:image/png;base64,iVBOR' },
  });
  assert.deepEqual(V.signMelding({ warnings: ['Bevestigingsmail naar klant mislukt'] }), {
    ok: false,
    tekst: 'Ondertekend en afgerond, maar: Bevestigingsmail naar klant mislukt',
  });
  assert.equal(V.signMelding({}).ok, true);
});
