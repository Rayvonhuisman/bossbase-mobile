/**
 * Klant- en fasekleuren gelijk aan het dashboard (`klantKleur` en
 * `faseKleuren` in bb-shared.jsx, `pipelineKleuren` in InstellingenPage.jsx).
 * De verwachte waarden zijn met de dashboardcode zelf berekend op de klanten
 * en fasen van Test Account Claude (27-10-2026).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const K = await import('../src/lib/klantKleur.ts');
const P = await import('../src/lib/pipelineLogica.ts');

test('klantkleur: zelfde hash en palet als het dashboard', () => {
  const verwacht = {
    'aa395c45-8033-4744-a22c-0cc0223aff03': 'geel',
    'de8d1928-cf25-42b8-a0b6-3c0902245181': 'geel',
    '541a8117-12c2-4ef8-8afb-d681302ceeea': 'roze',
    'b36a3dad-3e00-46b8-88a1-ebf24179a930': 'oranje',
    'c3cf42a9-cb85-426d-b918-d98b0c531e30': 'blauw',
  };
  for (const [id, kleur] of Object.entries(verwacht)) assert.equal(K.klantKleur({ id }).id, kleur, id);
  // Gekozen kleur wint; onbekende waarde valt terug op de hash; grijs alleen als gekozen.
  assert.equal(K.klantKleur({ id: 'aa395c45-8033-4744-a22c-0cc0223aff03', kleur: 'paars' }).id, 'paars');
  assert.equal(K.klantKleur({ id: 'aa395c45-8033-4744-a22c-0cc0223aff03', kleur: 'onzin' }).id, 'geel');
  assert.equal(K.klantKleur({ id: 'x', kleur: 'grijs' }).id, 'grijs');
  for (let i = 0; i < 500; i++) assert.notEqual(K.klantKleur({ id: `id-${i}` }).id, 'grijs');
  assert.deepEqual(K.klantAvatarKleuren({ id: 'c3cf42a9-cb85-426d-b918-d98b0c531e30' }, false), {
    bg: '#DBEAFE',
    fg: '#1D4ED8',
  });
});

test('fasekleuren: elke fase een eigen kleur, Verloren rood, zoals de pipeline', () => {
  const fasen = [
    ['Nieuwe aanvragen', 'b-new', '#1ddb62'],
    ['Contact nodig', 'b-orange', '#f97316'],
    ['Info compleet', 'b-blue', '#3b82f6'],
    ['Offerte maken', 'b-blue', '#a855f7'],
    ['Offerte verstuurd', 'b-orange', '#14b8a6'],
    ['Wacht op akkoord', 'b-orange', '#eab308'],
    ['Akkoord', 'b-green', '#ec4899'],
    ['Gepland', 'b-planned', '#6366f1'],
    ['In uitvoering', 'b-progress', '#06b6d4'],
    ['Gefactureerd', 'b-blue', '#84cc16'],
    ['Betaald', 'b-accepted', '#10b981'],
    ['Verloren', 'b-lost', '#ef4444'],
  ].map(([name, color_class, hex], i) => ({ id: `f${i}`, name, position: i + 1, color_class, hex }));
  const k = P.pipelineFaseKleuren(fasen);
  for (const f of fasen) assert.equal(k[f.id], f.hex, f.name);
  // Eigen keuze (hex) wordt precies zo getoond, ook als hij dubbel is.
  const eigen = P.pipelineFaseKleuren([
    { id: 'a', name: 'A', position: 1, color_class: '#ef4444' },
    { id: 'v', name: 'Verloren', position: 2, color_class: 'b-lost' },
    { id: 'b', name: 'B', position: 3, color_class: 'b-blue' },
  ]);
  assert.deepEqual(eigen, { a: '#ef4444', v: '#ef4444', b: '#3b82f6' });
  // Afgerond telt niet mee bij het verdelen (geen kolom op het bord).
  const metAfgerond = P.pipelineFaseKleuren([
    { id: 'a', name: 'Nieuw', position: 1, color_class: 'b-new' },
    { id: 'b', name: 'Offerte', position: 2, color_class: '#1DDB62' },
    { id: 'c', name: 'Afgerond', position: 3, color_class: 'b-done' },
    { id: 'd', name: 'Verloren', position: 4, color_class: 'b-lost' },
    { id: 'e', name: 'X', position: 5, color_class: 'b-red' },
  ]);
  assert.deepEqual(metAfgerond, { b: '#1ddb62', d: '#ef4444', a: '#3b82f6', e: '#f97316', c: '#f97316' });
  assert.equal(P.vrijeFaseKleur(fasen, ['#ef4444', '#f43f5e']), '#f43f5e');
});
