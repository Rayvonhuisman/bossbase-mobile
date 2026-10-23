import { File } from 'expo-file-system';
import { Dialog } from './dialog';
import type { KandidaatBestand } from './kiesBestandType';

export type { KandidaatBestand } from './kiesBestandType';

/**
 * Bestanden kiezen uit de bestanden van de telefoon of tablet (iCloud Drive,
 * Downloads, Google Drive …). Meerdere tegelijk. Het type wordt pas bij het
 * uploaden getoetst (bestandenService), zodat iemand hoort wát er niet kan in
 * plaats van een kiezer waarin het bestand grijs staat. Webvariant:
 * kiesBestand.web.ts. Null bij annuleren of een fout (die is dan gemeld).
 *
 * De kiezer is een native module die pas in builds van na 23-10 zit. Hij wordt
 * daarom pas hier geladen: in een oudere build crasht de klantkaart dan niet,
 * maar zegt deze knop dat de app bijgewerkt moet worden.
 */
export async function kiesBestanden(): Promise<KandidaatBestand[] | null> {
  let DocumentPicker: typeof import('expo-document-picker');
  try {
    DocumentPicker = await import('expo-document-picker');
  } catch {
    Dialog.alert('Werk de app bij', 'Bestanden kiezen kan in een nieuwere versie van de app. Camera en fotobibliotheek werken wel.');
    return null;
  }
  try {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
    if (r.canceled || !r.assets?.length) return null;
    return r.assets.map((a) => ({
      naam: a.name || 'bestand',
      mime: a.mimeType ?? null,
      grootte: a.size ?? new File(a.uri).size ?? 0,
      lees: async () => (await new File(a.uri).bytes()).buffer as ArrayBuffer,
    }));
  } catch {
    Dialog.alert('Bestand niet gelezen', 'Er ging iets mis bij het kiezen van het bestand.');
    return null;
  }
}
