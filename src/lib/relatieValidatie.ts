/**
 * Validatie van de zakelijke nummers van een relatie (KvK, btw, IBAN) — één op
 * één `src/lib/validatie.js` van het dashboard, met dezelfde meldingen.
 *
 * Waarom aan onze kant: SnelStart keurt een ongeldig btw-nummer of IBAN af en
 * laat dan de hele relatie mislukken, inclusief elke kostenpost die eraan hangt.
 * Beter meteen bij het invoeren afvangen dan dagen later bij een sync.
 *
 * Alle drie zijn tolerant voor spaties, punten en streepjes, en accepteren een
 * lege waarde: de velden zijn optioneel. Puur, zonder imports, zodat het los te
 * testen is (`tests/relaties.test.mjs`).
 */

const schoon = (v: unknown): string =>
  String(v ?? '')
    .replace(/[\s.-]/g, '')
    .toUpperCase();

/** Elfproef: som van cijfer × positiegewicht moet deelbaar zijn door 11. */
function elfproef(cijfers: string, gewichten: readonly number[]): boolean {
  let som = 0;
  for (let i = 0; i < gewichten.length; i++) som += Number(cijfers[i]) * (gewichten[i] ?? 0);
  return som % 11 === 0;
}

/**
 * Nederlands btw-identificatienummer: NL + 9 cijfers + B + 2 cijfers, met de
 * elfproef op de 9 cijfers. Buitenlandse nummers laten we met rust.
 */
export function valideerBtwNummer(waarde: string | null | undefined): string | null {
  const v = schoon(waarde);
  if (!v) return null;
  if (!v.startsWith('NL')) return null;
  if (!/^NL\d{9}B\d{2}$/.test(v)) {
    return 'Een Nederlands btw-nummer ziet eruit als NL123456789B01.';
  }
  if (!elfproef(v.slice(2, 11), [9, 8, 7, 6, 5, 4, 3, 2, -1])) {
    return 'Dit btw-nummer klopt niet — controleer de cijfers.';
  }
  return null;
}

/** KvK-nummer: 8 cijfers. */
export function valideerKvk(waarde: string | null | undefined): string | null {
  const v = schoon(waarde);
  if (!v) return null;
  if (!/^\d{8}$/.test(v)) return 'Een KvK-nummer bestaat uit 8 cijfers.';
  return null;
}

/**
 * IBAN volgens de mod-97-controle (ISO 13616): land en controlegetal naar
 * achteren, letters naar cijfers, de rest bij deling door 97 moet 1 zijn.
 */
export function valideerIban(waarde: string | null | undefined): string | null {
  const v = schoon(waarde);
  if (!v) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) {
    return 'Dit lijkt geen geldige IBAN — controleer het rekeningnummer.';
  }
  if (v.startsWith('NL') && v.length !== 18) {
    return 'Een Nederlandse IBAN bestaat uit 18 tekens.';
  }
  const verplaatst = v.slice(4) + v.slice(0, 4);
  const numeriek = verplaatst.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  // In blokken rekenen: het getal is te groot voor Number.
  let rest = 0;
  for (const cijfer of numeriek) rest = (rest * 10 + Number(cijfer)) % 97;
  if (rest !== 1) return 'Dit rekeningnummer klopt niet — controleer de IBAN.';
  return null;
}

export type RelatieVeldFouten = {
  kvk_number?: string;
  btw_number?: string;
  iban?: string;
};

/** Alle zakelijke velden in één keer. Leeg object = alles in orde. */
export function valideerRelatieVelden(velden: {
  kvk_number?: string | null;
  btw_number?: string | null;
  iban?: string | null;
}): RelatieVeldFouten {
  const fouten: RelatieVeldFouten = {};
  const btw = valideerBtwNummer(velden.btw_number);
  const kvk = valideerKvk(velden.kvk_number);
  const iban = valideerIban(velden.iban);
  if (btw) fouten.btw_number = btw;
  if (kvk) fouten.kvk_number = kvk;
  if (iban) fouten.iban = iban;
  return fouten;
}

/** De eerste fout (dashboardgedrag: één melding tegelijk), of null. */
export function eersteRelatieFout(velden: Parameters<typeof valideerRelatieVelden>[0]): string | null {
  const fouten = valideerRelatieVelden(velden);
  return fouten.btw_number ?? fouten.kvk_number ?? fouten.iban ?? null;
}
