import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { base64NaarBytes } from './base64';

/**
 * Delen en printen van een PDF in de app. Web: pdfDelen.web.ts.
 *
 * iPhone/iPad: het deelmenu heeft zelf "Druk af", dus geen aparte printknop.
 * Android: het deelmenu kan niet printen, daarom een kleine printknop ernaast.
 */
export const kanPrintenViaDelen = Platform.OS === 'ios';

function alsBestand(base64: string, bestandsnaam: string): string {
  const f = new File(Paths.cache, veiligeBestandsnaam(bestandsnaam));
  if (f.exists) f.delete();
  f.create();
  f.write(base64NaarBytes(base64));
  return f.uri;
}

const veiligeBestandsnaam = (naam: string) => naam.replace(/[\\/:*?"<>|]/g, '-');

export async function deelPdf(base64: string, bestandsnaam: string): Promise<void> {
  const uri = alsBestand(base64, bestandsnaam);
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: bestandsnaam });
}

/** Elk soort bestand delen via het deelmenu van het toestel (Bestanden). */
export async function deelBestand(base64: string, bestandsnaam: string, mime: string): Promise<void> {
  if (mime === 'application/pdf') return deelPdf(base64, bestandsnaam);
  const uri = alsBestand(base64, bestandsnaam);
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: bestandsnaam });
}

/**
 * Bewaren op het toestel. Android: een map kiezen en het bestand daarin zetten.
 * iPhone/iPad: het deelmenu, met "Bewaar in Bestanden" (en "Bewaar afbeelding"
 * bij een foto); een app mag daar niet zelf in schrijven.
 * Geeft false als de gebruiker annuleert.
 */
export async function bewaarBestand(base64: string, bestandsnaam: string, mime: string): Promise<boolean> {
  if (Platform.OS === 'android') {
    let map: Directory;
    try {
      map = await Directory.pickDirectoryAsync();
    } catch {
      return false;
    }
    const f = map.createFile(veiligeBestandsnaam(bestandsnaam), mime);
    f.write(base64NaarBytes(base64));
    return true;
  }
  await deelBestand(base64, bestandsnaam, mime);
  return true;
}

export async function printPdf(base64: string, bestandsnaam: string): Promise<void> {
  const uri = alsBestand(base64, bestandsnaam);
  await Print.printAsync({ uri });
}
