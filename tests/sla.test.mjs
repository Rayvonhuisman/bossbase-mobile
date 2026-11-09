/**
 * SLA-status van een werkbon (src/lib/sla.ts), zelfde regel als het dashboard:
 * te laat = deadline voorbij en niet gestart/afgerond; bijna = ≤ 25% van de
 * norm over of < 2 uur; anders op tijd. Plus de meldinglinks van contracten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sla = await import('../src/lib/sla.ts');
const link = await import('../src/lib/meldingLink.ts');

const NU = Date.parse('2026-11-09T10:00:00Z');
const uur = 3600_000;
const iso = (t) => new Date(t).toISOString();

test('geen deadline → geen status', () => {
  assert.equal(sla.slaStatus({ deadline: null, nu: NU }), null);
  assert.equal(sla.slaStatus({ deadline: 'onzin', nu: NU }), null);
});

test('open en deadline voorbij → te laat', () => {
  assert.equal(sla.slaStatus({ deadline: iso(NU - 1000), nu: NU, normUren: 4 }), 'te_laat');
});

test('open, ruim de tijd → op tijd', () => {
  assert.equal(sla.slaStatus({ deadline: iso(NU + 20 * uur), nu: NU, normUren: 24 }), 'op_tijd');
});

test('minder dan 2 uur over → bijna, ook bij een lange norm', () => {
  assert.equal(sla.slaStatus({ deadline: iso(NU + 1.5 * uur), nu: NU, normUren: 100 }), 'bijna');
  assert.equal(sla.slaStatus({ deadline: iso(NU + 1.5 * uur), nu: NU }), 'bijna');
});

test('≤ 25% van de norm over → bijna; net daarboven → op tijd', () => {
  // norm 24 uur → 25% = 6 uur
  assert.equal(sla.slaStatus({ deadline: iso(NU + 6 * uur), nu: NU, normUren: 24 }), 'bijna');
  assert.equal(sla.slaStatus({ deadline: iso(NU + 6 * uur + 60_000), nu: NU, normUren: 24 }), 'op_tijd');
  // norm als tekst (numeric uit PostgREST)
  assert.equal(sla.slaStatus({ deadline: iso(NU + 5 * uur), nu: NU, normUren: '24' }), 'bijna');
  // zonder norm alleen de 2-uursregel
  assert.equal(sla.slaStatus({ deadline: iso(NU + 5 * uur), nu: NU, normUren: null }), 'op_tijd');
});

test('precies op de deadline is nog niet te laat', () => {
  assert.equal(sla.slaStatus({ deadline: iso(NU), nu: NU }), 'bijna');
});

test('gestart/afgerond vóór de deadline → gehaald, erna → te laat', () => {
  const d = iso(NU);
  assert.equal(sla.slaStatus({ deadline: d, klaarOp: iso(NU - uur), nu: NU + 99 * uur }), 'gehaald');
  assert.equal(sla.slaStatus({ deadline: d, klaarOp: d, nu: NU }), 'gehaald');
  assert.equal(sla.slaStatus({ deadline: d, klaarOp: iso(NU + 1000), nu: NU - uur }), 'te_laat');
});

test('slaRegels: reactie op gestart_op, oplossen op afgerond_op', () => {
  const w = {
    status: 'in_uitvoering',
    sla_reactie_voor: iso(NU - uur),
    sla_oplossen_voor: iso(NU + 30 * uur),
    gestart_op: iso(NU - 2 * uur),
    afgerond_op: null,
  };
  const r = sla.slaRegels(w, { reactie_uren: 4, oplos_uren: 48 }, NU);
  assert.deepEqual(
    r.map((x) => [x.soort, x.status]),
    [
      ['reactie', 'gehaald'],
      ['oplossen', 'op_tijd'],
    ],
  );
  assert.equal(sla.slaBadge(w, { reactie_uren: 4, oplos_uren: 48 }, NU), 'op_tijd');
});

test('slaRegels: niet gestart en reactie voorbij → badge te laat', () => {
  const w = { status: 'gepland', sla_reactie_voor: iso(NU - 60_000), sla_oplossen_voor: iso(NU + 50 * uur) };
  assert.equal(sla.slaBadge(w, null, NU), 'te_laat');
});

test('afgerond zonder gestart_op: afronding telt als reactie', () => {
  const w = {
    status: 'afgerond',
    sla_reactie_voor: iso(NU),
    sla_oplossen_voor: iso(NU + uur),
    gestart_op: null,
    afgerond_op: iso(NU - uur),
  };
  assert.equal(sla.slaBadge(w, null, NU + 100 * uur), 'gehaald');
});

test('zonder normen telt de tijd van melding tot deadline als norm', () => {
  // gemeld 30 uur geleden, deadline over 8 uur → termijn 38 u, 25% = 9,5 u → bijna
  const w = { status: 'gepland', created_at: iso(NU - 30 * uur), sla_oplossen_voor: iso(NU + 8 * uur) };
  assert.equal(sla.slaBadge(w, null, NU), 'bijna');
  // met de echte norm (48 u, 25% = 12 u) ook bijna; met norm 24 u (25% = 6 u) op tijd
  assert.equal(sla.slaBadge(w, { oplos_uren: 24 }, NU), 'op_tijd');
});

test('geannuleerd of zonder deadlines → geen badge', () => {
  assert.equal(sla.slaBadge({ status: 'geannuleerd', sla_reactie_voor: iso(NU - uur) }, null, NU), null);
  assert.equal(sla.slaBadge({ status: 'gepland' }, null, NU), null);
});

test('In te plannen: zonder datum en niet klaar; sortering op uiterlijk_op', () => {
  assert.equal(sla.isInTePlannen({ gepland_op: null, status: 'gepland' }), true);
  assert.equal(sla.isInTePlannen({ gepland_op: '2026-11-10', status: 'gepland' }), false);
  assert.equal(sla.isInTePlannen({ gepland_op: null, status: 'afgerond' }), false);
  assert.equal(sla.isInTePlannen({ gepland_op: null, status: 'geannuleerd' }), false);
  const lijst = [
    { id: 'c', created_at: '2026-11-01' },
    { id: 'b', uiterlijk_op: '2026-12-01', created_at: '2026-11-02' },
    { id: 'a', uiterlijk_op: '2026-11-20', created_at: '2026-11-03' },
    { id: 's', sla_reactie_voor: '2026-11-11T08:00:00Z', sla_oplossen_voor: '2026-11-12T16:00:00Z', created_at: '2026-11-09' },
    // reactie al verlopen → bovenaan
    { id: 'r', sla_reactie_voor: '2026-11-09T08:00:00Z', sla_oplossen_voor: '2026-11-13T16:00:00Z', created_at: '2026-11-08' },
    // gestart: alleen de oplosdeadline telt
    { id: 'g', gestart_op: '2026-11-09T07:00:00Z', sla_reactie_voor: '2026-11-09T08:00:00Z', sla_oplossen_voor: '2026-11-25T16:00:00Z', created_at: '2026-11-08' },
    { id: 'd', created_at: '2026-10-01' },
  ];
  assert.deepEqual(
    [...lijst].sort(sla.vergelijkInTePlannen).map((x) => x.id),
    ['r', 's', 'a', 'g', 'b', 'd', 'c'],
  );
});

test('resterende tijd in woorden', () => {
  assert.equal(sla.resterendTekst(iso(NU + 3 * uur + 20 * 60_000), NU), 'nog 3 u 20 min');
  assert.equal(sla.resterendTekst(iso(NU + 2 * uur), NU), 'nog 2 u');
  assert.equal(sla.resterendTekst(iso(NU + 50 * uur), NU), 'nog 2 dagen');
  assert.equal(sla.resterendTekst(iso(NU - 45 * 60_000), NU), '45 min te laat');
  assert.equal(sla.resterendTekst(null, NU), null);
});

test('deadline in Nederlandse tijd', () => {
  // 10-11-2026 13:00 UTC = 14:00 in Amsterdam (wintertijd)
  assert.match(sla.deadlineTekst('2026-11-10T13:00:00Z'), /10 nov.*14:00/);
});

test('meldingen over contracten openen het contract in de app', () => {
  assert.equal(link.routeVoorLink('contracten/c1'), '/customers/contract/c1');
  assert.equal(link.routeVoorLink('/contracten/c1'), '/customers/contract/c1');
  assert.equal(link.routeVoorLink('contracten'), '/customers');
});
