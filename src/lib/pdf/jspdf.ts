import { base64NaarBytes } from '../base64';
import { bytesNaarBase64 } from './afbeelding';
import type { JsPDFKlasse } from './bouwPdf';

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

let geladen: JsPDFKlasse | null = null;

export async function laadJsPDF(): Promise<JsPDFKlasse> {
  if (!geladen) {
    zorgVoorBase64Globals();
    const mod = await import('jspdf');
    geladen = (mod.jsPDF || (mod as unknown as { default: JsPDFKlasse }).default) as JsPDFKlasse;
  }
  return geladen;
}
