import * as ImagePicker from 'expo-image-picker';
import { Dialog } from '@/lib/dialog';
import { bereidFotoVoor, FOTO_ALS_BASE64 } from '@/lib/fotoVoorbereiden';
import type { VoorbereideFoto } from '@/lib/fotoType';

/**
 * Eén afbeelding uit de fotobibliotheek kiezen en klaarmaken voor de upload.
 * Type en extensie komen uit de bytes (`bereidFotoVoor`), niet uit de naam.
 * Geeft null bij annuleren of een fout (die is dan al gemeld).
 */
export async function kiesAfbeelding(): Promise<Extract<VoorbereideFoto, { ok: true }> | null> {
  try {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: FOTO_ALS_BASE64,
    });
    if (r.canceled) return null;
    const asset = r.assets?.[0];
    if (!asset) {
      Dialog.alert('Foto niet gelezen', 'Probeer het opnieuw of kies een andere afbeelding.');
      return null;
    }
    const foto = await bereidFotoVoor(asset);
    if (!foto.ok) {
      Dialog.alert(foto.titel, foto.tekst);
      return null;
    }
    return foto;
  } catch {
    Dialog.alert('Foto niet gelezen', 'Er ging iets mis bij het kiezen van de afbeelding.');
    return null;
  }
}
