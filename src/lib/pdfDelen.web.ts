import { base64NaarBytes } from './base64';

/**
 * Web/PWA: delen via het deelmenu van het toestel (Web Share API met bestand),
 * anders downloaden. Op iPhone/iPad heeft dat menu "Druk af"; elders een
 * aparte printknop.
 */
const isIos =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1));

const kanBestandDelen = (f: File) =>
  typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });

export const kanPrintenViaDelen = isIos;

function alsBestand(base64: string, bestandsnaam: string): File {
  return new File([base64NaarBytes(base64) as BlobPart], bestandsnaam, { type: 'application/pdf' });
}

export async function deelPdf(base64: string, bestandsnaam: string): Promise<void> {
  const f = alsBestand(base64, bestandsnaam);
  if (kanBestandDelen(f)) {
    try {
      await navigator.share({ files: [f], title: bestandsnaam });
      return;
    } catch (e) {
      // Zelf geannuleerd: niets doen.
      if ((e as { name?: string })?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url;
  a.download = bestandsnaam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Printen: de PDF in een verborgen frame laden en daar het printvenster openen. */
export async function printPdf(base64: string, bestandsnaam: string): Promise<void> {
  const url = URL.createObjectURL(alsBestand(base64, bestandsnaam));
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.src = url;
  document.body.appendChild(frame);
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // Sommige browsers (Android) printen een PDF niet uit een frame: open hem dan los.
      window.open(url, '_blank');
    }
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
}
