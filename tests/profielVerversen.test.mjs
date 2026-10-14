/** Regressie: verversen na opslaan mag de navigatie niet resetten (status blijft 'ready'). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bron = readFileSync(new URL('../src/providers/AuthProvider.tsx', import.meta.url), 'utf8');

test('refreshProfile ververst stil, zonder loading-profile', () => {
  assert.match(bron, /loadProfile\(userId, true\)/);
  assert.match(bron, /if \(!stil\) setStatus\('loading-profile'\)/);
});

test('mislukte stille verversing laat het profiel staan', () => {
  assert.match(bron, /if \(!result\.ok && stil\) return;/);
});
