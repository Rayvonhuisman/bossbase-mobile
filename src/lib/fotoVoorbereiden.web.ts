import type { ImagePickerAsset } from 'expo-image-picker';
import {
  FOTO_NIET_GELEZEN,
  FOTO_ONBEKEND_TYPE,
  FOTO_TE_GROOT,
  MAX_FOTO_BYTES,
  herkenFotoType,
  type VoorbereideFoto,
} from './fotoType';

/**
 * Een gekozen foto klaarmaken voor de upload, in de browser.
 *
 * Op web negeert de kiezer `quality`: je krijgt het originele bestand, vaak
 * 3–8 MB, met EXIF-gegevens (inclusief GPS-locatie) erin. Daarom gebeurt hier
 * wat het dashboard bij het uploaden ook doet:
 *
 * 1. Het origineel controleren: alleen JPEG, PNG of WebP, herkend aan de
 *    bytes — niet aan de naam of `file.type` — en niet absurd groot.
 * 2. Verkleinen tot maximaal 1600 pixels aan de lange zijde (de maat van het
 *    dashboard) en opnieuw opslaan als JPEG. Dat scheelt opslag en wachttijd,
 *    gooit de EXIF-gegevens weg, en wat er omhoog gaat is gegarandeerd een
 *    afbeelding die de browser zelf heeft getekend.
 * 3. De uitkomst nog één keer aan de bytes controleren.
 */

/** Zelfde maat als `FOTO_MAX_ZIJDE` in het dashboard. */
const MAX_ZIJDE = 1600;
/** Zelfde verhouding als `quality: 0.7` op native, iets ruimer voor JPEG-hercodering. */
const KWALITEIT = 0.8;
/** Wat de browser überhaupt mag gaan decoderen. */
const MAX_ORIGINEEL_BYTES = 40 * 1024 * 1024;

export async function bereidFotoVoor(asset: ImagePickerAsset): Promise<VoorbereideFoto> {
  const bestand = asset.file ?? (await haalBlob(asset.uri));
  if (!bestand) return FOTO_NIET_GELEZEN;
  if (bestand.size > MAX_ORIGINEEL_BYTES) return FOTO_TE_GROOT;

  // De eerste bytes van het origineel bepalen of we het überhaupt openen.
  const kop = new Uint8Array(await bestand.slice(0, 16).arrayBuffer());
  if (!herkenFotoType(kop)) return FOTO_ONBEKEND_TYPE;

  // Via een <img>: elke moderne browser past daarbij de EXIF-oriëntatie toe,
  // zodat een staande telefoonfoto staand blijft. (`createImageBitmap` met
  // `imageOrientation` kent niet elke Safari-versie.)
  const url = URL.createObjectURL(bestand);
  let beeld: HTMLImageElement;
  try {
    beeld = new Image();
    beeld.src = url;
    await beeld.decode();
  } catch {
    URL.revokeObjectURL(url);
    return FOTO_NIET_GELEZEN;
  }

  const schaal = Math.min(1, MAX_ZIJDE / Math.max(beeld.naturalWidth, beeld.naturalHeight));
  const breedte = Math.max(1, Math.round(beeld.naturalWidth * schaal));
  const hoogte = Math.max(1, Math.round(beeld.naturalHeight * schaal));

  const canvas = document.createElement('canvas');
  canvas.width = breedte;
  canvas.height = hoogte;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(url);
    return FOTO_NIET_GELEZEN;
  }
  // Wit onder een PNG met transparantie; JPEG kent geen doorzichtig.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, breedte, hoogte);
  ctx.drawImage(beeld, 0, 0, breedte, hoogte);
  URL.revokeObjectURL(url);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', KWALITEIT),
  );
  if (!blob) return FOTO_NIET_GELEZEN;

  const bytes = await blob.arrayBuffer();
  const type = herkenFotoType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
  if (!type) return FOTO_NIET_GELEZEN;
  if (bytes.byteLength > MAX_FOTO_BYTES) return FOTO_TE_GROOT;
  return { ok: true, bytes, ...type };
}

async function haalBlob(uri: string): Promise<Blob | null> {
  try {
    const res = await fetch(uri);
    return await res.blob();
  } catch {
    return null;
  }
}

/** Op web is base64 overbodig: het bestand zelf is er al. */
export const FOTO_ALS_BASE64 = false;
