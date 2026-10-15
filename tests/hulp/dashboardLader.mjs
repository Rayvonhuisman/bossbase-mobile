/**
 * Laadt modules uit de dashboardrepo in Node, voor tests die de app naast het
 * dashboard leggen. `lib/supabase` van het dashboard wordt
 * `globalThis.__bbSupabase` (zet daar een nep-client of een ingelogde client
 * in), `import.meta.env` een gewoon object, en importen zonder extensie
 * krijgen `.js` — zoals Vite dat oplost.
 *
 * Geeft `null` als de dashboardrepo niet op deze machine staat (CI).
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as padResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dashboardRepo } from '../../scripts/pdf-opbouw-bron.mjs';

let geregistreerd = null;

export function dashboardLader() {
  if (geregistreerd) return geregistreerd;
  const repo = dashboardRepo();
  if (!repo) return null;
  const dashSrc = join(repo, 'src');
  const SHIM = 'bb-shim:supabase';
  registerHooks({
    resolve(spec, ctx, next) {
      const ouder = ctx.parentURL?.startsWith('file:') ? fileURLToPath(ctx.parentURL) : null;
      if (ouder?.startsWith(dashSrc) && (spec.startsWith('./') || spec.startsWith('../'))) {
        const pad = padResolve(dirname(ouder), spec);
        if (pad.replace(/\.js$/, '') === join(dashSrc, 'lib/supabase')) return { url: SHIM, shortCircuit: true };
        if (!/\.[cm]?[jt]sx?$/.test(pad)) return next(pathToFileURL(`${pad}.js`).href, ctx);
      }
      return next(spec, ctx);
    },
    load(url, ctx, next) {
      if (url === SHIM) {
        return {
          format: 'module',
          shortCircuit: true,
          source: 'export const supabase = new Proxy({}, { get: (_, k) => globalThis.__bbSupabase[k] }); export const isDemo = false;',
        };
      }
      if (url.startsWith('file:') && fileURLToPath(url).startsWith(dashSrc)) {
        const bron = readFileSync(fileURLToPath(url), 'utf8').replace(/import\.meta\.env/g, 'globalThis.__viteEnv');
        return { format: 'module', shortCircuit: true, source: bron };
      }
      return next(url, ctx);
    },
  });
  globalThis.__viteEnv = globalThis.__viteEnv || { VITE_SUPABASE_URL: 'https://x.supabase.co', DEV: false, PROD: true };
  geregistreerd = {
    repo,
    importeer: (pad) => import(pathToFileURL(join(repo, pad)).href),
  };
  return geregistreerd;
}
