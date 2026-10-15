import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Dialog } from './dialog';
import { bereidFotoVoor, FOTO_ALS_BASE64 } from './fotoVoorbereiden';
import type { VoorbereideFoto } from './fotoType';

export type GekozenFoto = Extract<VoorbereideFoto, { ok: true }> & { uri: string };

/**
 * Een foto maken of kiezen en klaarmaken voor de upload — de stappen van de
 * werkbonfoto's (camera of bibliotheek, toestemming, type uit de bytes), voor
 * andere plekken zoals een bon bij een kostenpost. Null bij annuleren of een
 * fout (die is dan al gemeld).
 */
export function kiesFotoBron(titel: string): Promise<'camera' | 'bibliotheek' | null> {
  return new Promise((klaar) => {
    Dialog.alert(titel, 'Waar komt de foto vandaan?', [
      { text: 'Camera', onPress: () => klaar('camera') },
      { text: 'Fotobibliotheek', onPress: () => klaar('bibliotheek') },
      { text: 'Annuleren', style: 'cancel', onPress: () => klaar(null) },
    ]);
  });
}

export async function maakOfKiesFoto(bron: 'camera' | 'bibliotheek'): Promise<GekozenFoto | null> {
  try {
    if (Platform.OS !== 'web') {
      const toestemming =
        bron === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!toestemming.granted) {
        Dialog.alert(
          'Geen toestemming',
          bron === 'camera'
            ? 'Geef BossBase toegang tot de camera om een foto te maken.'
            : "Geef BossBase toegang tot je foto's om er een te kiezen.",
        );
        return null;
      }
    }
    const opties: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, base64: FOTO_ALS_BASE64 };
    const r = bron === 'camera' ? await ImagePicker.launchCameraAsync(opties) : await ImagePicker.launchImageLibraryAsync(opties);
    if (r.canceled) return null;
    const asset = r.assets?.[0];
    if (!asset) {
      Dialog.alert('Foto niet gelezen', 'Probeer het opnieuw of kies een andere foto.');
      return null;
    }
    const foto = await bereidFotoVoor(asset);
    if (!foto.ok) {
      Dialog.alert(foto.titel, foto.tekst);
      return null;
    }
    return { ...foto, uri: asset.uri };
  } catch {
    Dialog.alert('Foto niet gelezen', 'Er ging iets mis bij het kiezen van de foto.');
    return null;
  }
}
