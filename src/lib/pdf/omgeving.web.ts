import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { formaatUitDataUrl, maatOpPapier, type VoorbereideAfbeelding } from './afbeelding';
import { maakDocumentUrl, type PdfOmgeving } from './omgevingBasis';

/**
 * Web: dezelfde aanpak als `browserOmgeving` in het dashboard
 * (src/utils/generatePdf.js) — FileReader voor de data-URL, `Image` voor de
 * afmetingen, canvas om een te groot plaatje terug te brengen tot 300 dpi.
 * De code hieronder volgt die functies regel voor regel.
 */

const DPI = 300;
const MM_PER_INCH = 25.4;
const mmNaarPx = (mm: number) => Math.ceil((mm / MM_PER_INCH) * DPI);

async function imgToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function afbeeldingAfmetingen(
  dataUrl: string,
): Promise<{ w: number; h: number; img: HTMLImageElement } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, img });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function bereidAfbeeldingVoor(
  dataUrl: string,
  maxWmm: number,
  maxHmm: number,
): Promise<VoorbereideAfbeelding | null> {
  if (!dataUrl) return null;
  const dims = await afbeeldingAfmetingen(dataUrl);
  if (!dims || !dims.w || !dims.h) return null;

  const { breedte, hoogte } = maatOpPapier(dims, maxWmm, maxHmm);
  const doelPx = mmNaarPx(breedte);
  const origineelFormaat = formaatUitDataUrl(dataUrl);

  // Al klein genoeg? Dan niets aanraken — hertekenen kan alleen kwaliteit kosten.
  if (dims.w <= doelPx) return { dataUrl, formaat: origineelFormaat, breedte, hoogte };

  try {
    const schaal = doelPx / dims.w;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(dims.w * schaal));
    canvas.height = Math.max(1, Math.round(dims.h * schaal));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('geen 2d-context');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dims.img, 0, 0, canvas.width, canvas.height);
    const alsPng = canvas.toDataURL('image/png');

    // JPEG erbij, op wit samengevoegd (de ondergrond is wit papier).
    const witCanvas = document.createElement('canvas');
    witCanvas.width = canvas.width;
    witCanvas.height = canvas.height;
    const wctx = witCanvas.getContext('2d');
    if (!wctx) throw new Error('geen 2d-context');
    wctx.fillStyle = '#ffffff';
    wctx.fillRect(0, 0, witCanvas.width, witCanvas.height);
    wctx.drawImage(canvas, 0, 0);
    const alsJpeg = witCanvas.toDataURL('image/jpeg', 0.9);

    const kleinste =
      alsJpeg.length < alsPng.length
        ? { dataUrl: alsJpeg, formaat: 'JPEG' }
        : { dataUrl: alsPng, formaat: 'PNG' };
    return { ...kleinste, breedte, hoogte };
  } catch {
    // Canvas kan getaint zijn of ontbreken; dan liever een grote PDF dan geen.
    return { dataUrl, formaat: origineelFormaat, breedte, hoogte };
  }
}

export function pdfOmgeving(): PdfOmgeving {
  return {
    naarDataUrl: imgToBase64,
    bereidAfbeelding: bereidAfbeeldingVoor,
    afmetingen: async (dataUrl) => {
      const r = await afbeeldingAfmetingen(dataUrl);
      return r ? { w: r.w, h: r.h } : null;
    },
    documentUrl: maakDocumentUrl(supabase),
    supabaseUrl: env.SUPABASE_URL,
  };
}
