import type { ImagePickerAsset } from 'expo-image-picker';
import { base64NaarBytes } from './base64';
import {
  FOTO_NIET_GELEZEN,
  FOTO_ONBEKEND_TYPE,
  FOTO_TE_GROOT,
  MAX_FOTO_BYTES,
  herkenFotoType,
  type VoorbereideFoto,
} from './fotoType';

/**
 * Een gekozen foto klaarmaken voor de upload (iOS en Android).
 *
 * De kiezer heeft de foto al verkleind (`quality`) en levert hem als base64.
 * Hier alleen: omzetten naar bytes en het type uit de inhoud halen, zodat het
 * bestand de juiste extensie en `Content-Type` krijgt en alleen JPEG, PNG of
 * WebP de opslag bereikt. De webvariant staat in `fotoVoorbereiden.web.ts`.
 */
export async function bereidFotoVoor(asset: ImagePickerAsset): Promise<VoorbereideFoto> {
  if (!asset.base64) return FOTO_NIET_GELEZEN;
  const bytes = base64NaarBytes(asset.base64);
  const type = herkenFotoType(bytes);
  if (!type) return FOTO_ONBEKEND_TYPE;
  if (bytes.byteLength > MAX_FOTO_BYTES) return FOTO_TE_GROOT;
  return { ok: true, bytes: bytes.buffer as ArrayBuffer, ...type };
}

/** Op iOS en Android levert de kiezer de foto als base64 aan. */
export const FOTO_ALS_BASE64 = true;
