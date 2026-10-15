/** Route-knop: kaartenapp per apparaat, altijd een route naar het adres. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../src/lib/routeLinks.ts');

test('iPhone/iPad: Apple Kaarten; met Google Maps erop twee keuzes', () => {
  const alleen = R.routeKeuzes('Dorpsstraat 1, Utrecht', 'ios');
  assert.deepEqual(alleen.map((k) => k.label), ['Apple Kaarten']);
  assert.equal(alleen[0].url, 'https://maps.apple.com/?daddr=Dorpsstraat%201%2C%20Utrecht&dirflg=d');
  const beide = R.routeKeuzes('Dorpsstraat 1, Utrecht', 'ios', true);
  assert.deepEqual(beide.map((k) => k.label), ['Apple Kaarten', 'Google Maps']);
  assert.match(beide[1].url, /^comgooglemaps:\/\/\?daddr=/);
});

test('Android en computer: Google Maps-route', () => {
  for (const a of ['android', 'computer']) {
    const k = R.routeKeuzes('Dorpsstraat 1', a);
    assert.deepEqual(k, [{ label: 'Google Maps', url: 'https://www.google.com/maps/dir/?api=1&destination=Dorpsstraat%201' }]);
  }
  assert.deepEqual(R.routeKeuzes('   ', 'ios'), []);
});

test('apparaat uit de browser: iPadOS als Mac met touchscreen telt als iOS', () => {
  assert.equal(R.routeApparaatVanBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), 'ios');
  assert.equal(R.routeApparaatVanBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'ios');
  assert.equal(R.routeApparaatVanBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), 'computer');
  assert.equal(R.routeApparaatVanBrowser('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5), 'android');
});

test('geen losse maps-URL\'s meer buiten routeLinks', async () => {
  const { execSync } = await import('node:child_process');
  const hits = execSync("grep -rln 'maps.google.com\\|maps.apple.com' app src || true", { cwd: new URL('..', import.meta.url) }).toString().trim().split('\n').filter(Boolean);
  assert.deepEqual(hits, ['src/lib/routeLinks.ts']);
});
