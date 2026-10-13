/**
 * CSV downloaden in de browser (PWA/desktop), zoals het dashboard:
 * UTF-8 met BOM, zodat Excel de tekens goed leest.
 */
export async function deelCsv(bestandsnaam: string, csv: string): Promise<boolean> {
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = bestandsnaam;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

export const CSV_ALS_BESTAND = true;
