import { tx } from '@/i18n';

/**
 * Vaste lijst of tabel met schermteksten (een array van strings of een
 * `Record<string, string>`) die bij het lézen vertaalt.
 *
 * Zet de teksten erin met txm(), zodat talen-check ze vindt:
 *
 *   export const STATUS = vertaald({ open: txm('Open'), dicht: txm('Gesloten') });
 *   STATUS.open        // → tx('Open') in de huidige taal
 *
 * Zo blijven bestaande aanroepers (`STATUS[x]`, `LIJST.map(...)`) werken en
 * volgen ze toch de taal, ook al staat de lijst op moduleniveau. Alleen voor
 * platte lijsten met strings: objecten erin worden niet aangeraakt.
 */
export function vertaald<T extends object>(bron: T): T {
  return new Proxy(bron, {
    get(doel, sleutel, ontvanger) {
      const v = Reflect.get(doel, sleutel, ontvanger);
      return typeof v === 'string' && typeof sleutel === 'string' ? tx(v) : v;
    },
  });
}
