/**
 * Welke soort afbeelding het écht is, afgeleid uit de eerste bytes.
 *
 * Het MIME-type of de extensie die de kiezer meegeeft is een bewering, geen
 * feit: op web is de URI een `blob:` of `data:`-adres zonder extensie, en een
 * bestandsnaam of `file.type` is door iedereen te kiezen. De bytes zelf liegen
 * niet. Alleen JPEG, PNG en WebP worden toegelaten — dezelfde drie die het
 * dashboard accepteert en die elke browser en de werkbon-PDF kunnen tonen.
 * Alles anders (SVG met script erin, HEIC dat geen browser opent, PDF, een
 * hernoemd .exe) wordt geweigerd vóórdat het de opslag bereikt.
 */

export type FotoType = {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  extensie: 'jpg' | 'png' | 'webp';
};

export function herkenFotoType(bytes: Uint8Array): FotoType | null {
  const b = (i: number) => bytes[i] ?? -1;

  // JPEG: FF D8 FF
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) {
    return { contentType: 'image/jpeg', extensie: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 &&
    b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a
  ) {
    return { contentType: 'image/png', extensie: 'png' };
  }
  // WebP: "RIFF" ???? "WEBP"
  if (
    b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
    b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50
  ) {
    return { contentType: 'image/webp', extensie: 'webp' };
  }
  return null;
}

/** Bovengrens voor wat er na het voorbereiden omhoog mag: 10 MB. */
export const MAX_FOTO_BYTES = 10 * 1024 * 1024;

export type VoorbereideFoto =
  | { ok: true; bytes: ArrayBuffer; contentType: FotoType['contentType']; extensie: FotoType['extensie'] }
  | { ok: false; titel: string; tekst: string };

export const FOTO_ONBEKEND_TYPE = {
  ok: false as const,
  titel: 'Dit bestand kan niet',
  tekst: 'Kies een foto in JPG-, PNG- of WebP-formaat.',
};

export const FOTO_TE_GROOT = {
  ok: false as const,
  titel: 'Foto te groot',
  tekst: 'Deze foto is groter dan 10 MB. Kies een kleinere foto.',
};

export const FOTO_NIET_GELEZEN = {
  ok: false as const,
  titel: 'Foto niet gelezen',
  tekst: 'Probeer het opnieuw of kies een andere foto.',
};
