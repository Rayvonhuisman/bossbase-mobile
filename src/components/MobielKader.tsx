import type { ReactNode } from 'react';

/**
 * Het kader waarbinnen de app staat. Op iOS en Android is dat het scherm zelf,
 * dus hier gebeurt niets. De webvariant (`MobielKader.web.tsx`) houdt de app op
 * een groot scherm op telefoonbreedte.
 */
export function MobielKader({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
