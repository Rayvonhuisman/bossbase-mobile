import * as DocumentPicker from 'expo-document-picker';
import { Dialog } from './dialog';
import type { KandidaatBestand } from './kiesBestandType';

export type { KandidaatBestand } from './kiesBestandType';

// In de kiezer alleen wat ook geüpload mag worden (zie bestandenService).
const ACCEPT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.dwg', '.dxf'];

/**
 * Web/PWA: de bestandskiezer van de browser (op iPhone en iPad met "Neem foto",
 * "Fotobibliotheek" en "Kies bestand"). Geen await vóór de kiezer: Safari laat
 * de gebruikersactie anders verlopen.
 */
export async function kiesBestanden(): Promise<KandidaatBestand[] | null> {
  try {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, type: ACCEPT });
    if (r.canceled || !r.assets?.length) return null;
    return r.assets.map((a) => ({
      naam: a.file?.name ?? a.name ?? 'bestand',
      mime: a.file?.type || a.mimeType || null,
      grootte: a.file?.size ?? a.size ?? 0,
      lees: async () => {
        if (a.file) return a.file.arrayBuffer();
        return (await fetch(a.uri)).arrayBuffer();
      },
    }));
  } catch {
    Dialog.alert('Bestand niet gelezen', 'Er ging iets mis bij het kiezen van het bestand.');
    return null;
  }
}
