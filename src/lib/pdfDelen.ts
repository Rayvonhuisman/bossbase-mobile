import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { base64NaarBytes } from './base64';

/**
 * Delen en printen van een PDF in de app. Web: pdfDelen.web.ts.
 *
 * iPhone/iPad: het deelmenu heeft zelf "Druk af", dus geen aparte printknop.
 * Android: het deelmenu kan niet printen, daarom een kleine printknop ernaast.
 */
export const kanPrintenViaDelen = Platform.OS === 'ios';

function alsBestand(base64: string, bestandsnaam: string): string {
  const f = new File(Paths.cache, bestandsnaam.replace(/[\\/:*?"<>|]/g, '-'));
  if (f.exists) f.delete();
  f.create();
  f.write(base64NaarBytes(base64));
  return f.uri;
}

export async function deelPdf(base64: string, bestandsnaam: string): Promise<void> {
  const uri = alsBestand(base64, bestandsnaam);
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: bestandsnaam });
}

export async function printPdf(base64: string, bestandsnaam: string): Promise<void> {
  const uri = alsBestand(base64, bestandsnaam);
  await Print.printAsync({ uri });
}
