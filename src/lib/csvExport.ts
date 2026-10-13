import { Share } from 'react-native';

/**
 * CSV delen op iOS en Android. Zonder extra bestandsmodules (geen nieuwe
 * afhankelijkheden) kan de app hier geen bestand wegschrijven; het deelvenster
 * neemt de CSV-tekst mee, zodat je hem naar Mail, Notities of Bestanden kunt
 * sturen. De webvariant (`csvExport.web.ts`) downloadt een echt .csv-bestand.
 */
export async function deelCsv(bestandsnaam: string, csv: string): Promise<boolean> {
  try {
    const r = await Share.share({ title: bestandsnaam, message: csv.replace(/^﻿/, '') });
    return r.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}

/** Kan dit platform een echt bestand downloaden? */
export const CSV_ALS_BESTAND = false;
