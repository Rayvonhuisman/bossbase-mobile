/**
 * Pushmeldingen op de telefoon. De iOS- en Android-app (TestFlight) heeft nog
 * geen push; daar doet dit niets. De webvariant (app.bossbase.nl, ook als app
 * op het beginscherm) staat in `push.web.ts`.
 */
export type PushStand = 'niet-mogelijk' | 'ios-installeren' | 'geblokkeerd' | 'uit' | 'aan';

export async function pushStand(_userId: string): Promise<PushStand> {
  return 'niet-mogelijk';
}
export async function zetPushAan(_userId: string): Promise<void> {}
export async function zetPushUit(): Promise<void> {}
export async function herstelPush(_userId: string): Promise<void> {}
export function moetMeldingenVragen(): boolean {
  return false;
}
export function markeerMeldingenGevraagd(): void {}
