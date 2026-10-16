/**
 * Laat Node TypeScript-bestanden uit src/ importeren die elkaar zonder
 * extensie importeren (`from './afbeelding'`), zoals Metro en tsc dat
 * toestaan. Node zelf vereist een volledige bestandsnaam; deze hook probeert
 * `.ts`, `.tsx` en `/index.ts` erachter. `@/…` wijst naar src/.
 *
 * Alleen voor tests en scripts. Importeer dit bestand vóór de modules.
 */
import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as padResolve } from 'node:path';

const SRC = padResolve(dirname(fileURLToPath(import.meta.url)), '../../src');

function probeer(basis) {
  for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
    const p = basis + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let basis = null;
    if (specifier.startsWith('@/')) basis = padResolve(SRC, specifier.slice(2));
    else if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file:') &&
      !context.parentURL.includes('/node_modules/') // pakketten lossen hun eigen paden op
    ) {
      basis = padResolve(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (basis && !/\.[cm]?[jt]sx?$/.test(basis)) {
      const gevonden = probeer(basis);
      if (gevonden) return nextResolve(pathToFileURL(gevonden).href, context);
    }
    return nextResolve(specifier, context);
  },
});
