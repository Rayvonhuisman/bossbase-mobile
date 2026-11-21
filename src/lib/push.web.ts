import { supabase } from '@/lib/supabase';
import { tx } from '@/i18n';
import type { PushStand } from './push';

/**
 * Pushmeldingen op de telefoon (Web Push) — dezelfde meldingen als de bel.
 *
 * Een toestel meldt zich aan met het push-abonnement van de browser; dat staat
 * in de tabel `app_push` (alleen je eigen rijen, RLS). Bij elke nieuwe melding
 * voor jou stuurt de server (edge function `app-push`, aangeroepen door een
 * trigger op `notifications`) een push naar je toestellen. De service worker
 * (`public/sw.js`) toont hem; tikken opent `/melding`, dat de juiste pagina opent.
 *
 * iPhone en iPad: alleen in de app op het beginscherm (iOS 16.4+), niet in Safari.
 *
 * Zelfherstel: Apple en Chrome vernieuwen een abonnement soms (iOS-update, app
 * opnieuw op het beginscherm). De server wist dan het oude; bij elk openen van
 * de app meldt een toestel dat meldingen aan had zich opnieuw aan
 * (`herstelPush`). Zo vallen meldingen niet ongemerkt weg.
 */

const OPSLAG = 'bb_app_push';
const leesOpslag = (): { aan: boolean; endpoint?: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(OPSLAG) || 'null');
  } catch {
    return null;
  }
};
const schrijfOpslag = (v: { aan: boolean; endpoint?: string } | null) => {
  try {
    if (v) localStorage.setItem(OPSLAG, JSON.stringify(v));
    else localStorage.removeItem(OPSLAG);
  } catch {
    /* geen opslag */
  }
};

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const losseApp = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const ondersteund = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function apparaatNaam(): string {
  const ua = navigator.userAgent;
  const os = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) || isIos() ? 'iPad' : /android/i.test(ua) ? 'Android' : /mac os x/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Computer';
  return `${os} · ${losseApp() ? 'app' : 'browser'}`;
}

function sleutelNaarBytes(b64: string): ArrayBuffer {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const ruw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...ruw].map((c) => c.charCodeAt(0))).buffer as ArrayBuffer;
}

/** De service worker van de app (alleen in een productiebuild geregistreerd). */
async function registratie(): Promise<ServiceWorkerRegistration | null> {
  const r = await navigator.serviceWorker.getRegistration('/');
  if (r) return r;
  if (__DEV__) return null;
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  return navigator.serviceWorker.ready;
}

let sleutelCache: string | null = null;
async function sleutel(): Promise<string> {
  if (sleutelCache) return sleutelCache;
  const { data, error } = await supabase.functions.invoke('app-push', { body: { actie: 'sleutel' } });
  if (error || !data?.sleutel) throw new Error(tx('Meldingen zijn nu niet beschikbaar. Probeer het later opnieuw.'));
  sleutelCache = String(data.sleutel);
  return sleutelCache;
}

async function meldAan(userId: string, sub: PushSubscription): Promise<void> {
  const j = sub.toJSON();
  const { error } = await supabase.from('app_push').upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', apparaat: apparaatNaam(), laatste_fout: null },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(tx('Meldingen aanzetten is niet gelukt.'));
}

async function bekend(endpoint: string): Promise<boolean> {
  const { data } = await supabase.from('app_push').select('id').eq('endpoint', endpoint).maybeSingle();
  return !!data;
}

export async function pushStand(_userId: string): Promise<PushStand> {
  if (!ondersteund()) return isIos() && !losseApp() ? 'ios-installeren' : 'niet-mogelijk';
  if (isIos() && !losseApp()) return 'ios-installeren';
  if (Notification.permission === 'denied') return 'geblokkeerd';
  const reg = await registratie();
  if (!reg) return 'niet-mogelijk';
  const sub = await reg.pushManager.getSubscription();
  return sub && (await bekend(sub.endpoint)) ? 'aan' : 'uit';
}

export async function zetPushAan(userId: string): Promise<void> {
  const toestemming = await Notification.requestPermission();
  if (toestemming !== 'granted') {
    throw new Error(
      toestemming === 'denied'
        ? tx('Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je telefoon of browser.')
        : tx('Geen toestemming gegeven.'),
    );
  }
  const reg = await registratie();
  if (!reg) throw new Error(tx('Meldingen werken alleen in de geïnstalleerde app.'));
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: sleutelNaarBytes(await sleutel()) });
  await meldAan(userId, sub);
  schrijfOpslag({ aan: true, endpoint: sub.endpoint });
}

export async function zetPushUit(): Promise<void> {
  const reg = await registratie();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await supabase.from('app_push').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
  schrijfOpslag(null);
}

let laatsteHerstel = 0;
export async function herstelPush(userId: string): Promise<void> {
  if (!ondersteund() || Notification.permission !== 'granted' || (isIos() && !losseApp())) return;
  if (Date.now() - laatsteHerstel < 5 * 60000) return;
  laatsteHerstel = Date.now();
  const bewaard = leesOpslag();
  const reg = await registratie();
  if (!reg) return;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && !bewaard?.aan) return; // nooit aangezet of bewust uitgezet
  // Kent de server dit abonnement niet (meer), dan heeft de pushdienst het
  // meestal afgewezen: een vers nemen in plaats van het dode opnieuw te melden.
  if (sub && !(await bekend(sub.endpoint))) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: sleutelNaarBytes(await sleutel()) });
  await meldAan(userId, sub);
  if (bewaard?.endpoint && bewaard.endpoint !== sub.endpoint) {
    await supabase.from('app_push').delete().eq('endpoint', bewaard.endpoint);
  }
  schrijfOpslag({ aan: true, endpoint: sub.endpoint });
}
