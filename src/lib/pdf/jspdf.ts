import { base64NaarBytes } from '../base64';
import { bytesNaarBase64 } from './afbeelding';
import type { JsPDFKlasse } from './bouwPdf';
import { zorgVoorLatin1Decoder } from './latin1Decoder';
import { PdfFout } from './pdfData';

/**
 * jsPDF pas laden als er een PDF gemaakt wordt (net als het dashboard): de
 * bibliotheek is een paar honderd kB en is voor de rest van de app niet nodig.
 *
 * jsPDF pakt bij het laden `atob` en `btoa` van het globale object
 * (`globalObject.atob.bind(...)`); ontbreken ze, dan faalt al het importeren.
 * Hermes heeft ze in recente React Native-versies, maar niet elke engine
 * (oudere Hermes, JSC-builds, testomgevingen). Vandaar een terugval vóór het
 * importeren. Het gaat om "binaire strings" (één teken per byte), precies wat
 * jsPDF erin stopt.
 */
function zorgVoorBase64Globals() {
  const g = globalThis as unknown as {
    atob?: (s: string) => string;
    btoa?: (s: string) => string;
  };
  if (typeof g.atob !== 'function') {
    g.atob = (invoer: string) => {
      const bytes = base64NaarBytes(String(invoer));
      let uit = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        uit += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return uit;
    };
  }
  if (typeof g.btoa !== 'function') {
    g.btoa = (invoer: string) => {
      const tekst = String(invoer);
      const bytes = new Uint8Array(tekst.length);
      for (let i = 0; i < tekst.length; i++) {
        const c = tekst.charCodeAt(i);
        if (c > 255) throw new Error("Failed to execute 'btoa': karakter buiten Latin1");
        bytes[i] = c;
      }
      return bytesNaarBase64(bytes);
    };
  }
}

type FoutHandler = (fout: unknown, isFatal?: boolean) => void;
type ErrorUtilsT = { getGlobalHandler: () => FoutHandler; setGlobalHandler: (h: FoutHandler) => void };

/**
 * Importeren zonder dat een fout bij het laden de app afsluit.
 *
 * Gooit een module tijdens het laden een fout, dan vangt Metro die in een
 * release-build zelf af (guardedLoadModule in metro-runtime) en meldt hem als
 * fatale fout via `ErrorUtils.reportFatalError`: React Native sluit dan de
 * app. Een try/catch om `import()` ziet er niets van; het import geeft alleen
 * een lege module terug. Het laden zelf gebeurt synchroon binnen de aanroep
 * van `import()` (alles zit in één bundel), dus zetten we zolang een eigen
 * handler neer die die ene fatale fout opvangt, en daarna meteen de oude terug.
 * Waar ErrorUtils niet bestaat (web, Node) is dit een gewone import.
 */
export async function importeerZonderAfsluiten<T>(importeer: () => Promise<T>): Promise<T> {
  const eu = (globalThis as unknown as { ErrorUtils?: ErrorUtilsT }).ErrorUtils;
  const vorige = eu?.getGlobalHandler?.();
  if (!eu || !vorige) return importeer();

  let laadFout: unknown;
  let gevangen = false;
  eu.setGlobalHandler((fout, isFatal) => {
    if (isFatal && !gevangen) {
      gevangen = true;
      laadFout = fout;
    } else {
      vorige(fout, isFatal);
    }
  });
  let belofte: Promise<T>;
  try {
    belofte = importeer();
  } finally {
    eu.setGlobalHandler(vorige);
  }
  const mod = await belofte;
  if (gevangen) {
    console.warn('[pdf] PDF-bibliotheek laden mislukt', laadFout);
    throw new PdfFout('De PDF kan op dit toestel niet worden gemaakt. Bekijk hem in de webversie.');
  }
  return mod;
}

let geladen: JsPDFKlasse | null = null;

export async function laadJsPDF(): Promise<JsPDFKlasse> {
  if (!geladen) {
    zorgVoorBase64Globals();
    // fast-png (PNG-afbeeldingen in jsPDF) vraagt bij het laden om 'latin1'.
    if (!zorgVoorLatin1Decoder()) {
      throw new PdfFout('De PDF kan op dit toestel niet worden gemaakt. Bekijk hem in de webversie.');
    }
    const mod = await importeerZonderAfsluiten(() => import('jspdf'));
    const Klasse = mod?.jsPDF || (mod as unknown as { default?: JsPDFKlasse } | undefined)?.default;
    if (!Klasse) throw new PdfFout('De PDF kan op dit toestel niet worden gemaakt. Bekijk hem in de webversie.');
    geladen = Klasse as JsPDFKlasse;
  }
  return geladen;
}
