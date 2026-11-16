import { Text, View } from 'react-native';
import { NoticeBanner } from '@/components';
import { formatDateNL } from '@/lib/format';
import { alsTekst } from '@/lib/notitieTekst';
import { formatUren, urenOverzicht, urenToon } from '@/lib/projectLogica';
import type { ProjectUur } from '@/services/projectService';
import { Blok, Rij, useStijl, Veld } from './bouwstenen';
import { tx, locale } from '@/i18n';

/**
 * De Uren-tab van de projectkaart (`UrenTab` in het dashboard): alleen-lezen,
 * de optelsom van de werkbonuren van dit project. Boeken gaat op de werkbon,
 * want die bepaalt wie mag boeken.
 */
export function UrenTab({
  begroot,
  uren,
  onWerkbon,
}: {
  begroot: number | null;
  uren: ProjectUur[];
  onWerkbon: (werkbonId: string) => void;
}) {
  const { t, styles } = useStijl();
  const totaal = uren.reduce((s, u) => s + u.uren, 0);
  const o = urenOverzicht(begroot, totaal);
  const toon = urenToon(o.percentage);
  const kleur = toon === 'rood' ? t.statusRejectFg : toon === 'oranje' ? t.statusWarnFg : t.ink;

  return (
    <>
      <Blok titel={tx('Uren')}>
        <View style={styles.raster}>
          <Veld label={tx('Begroot')}>
            <Text style={styles.tegelWaarde}>{formatUren(o.begroot)}</Text>
          </Veld>
          <Veld label={tx('Geregistreerd')}>
            <Text style={[styles.tegelWaarde, { color: kleur }]}>{formatUren(o.gebruikt)}</Text>
          </Veld>
          <Veld label={tx('Resterend')}>
            <Text style={styles.tegelWaarde}>{formatUren(o.resterend)}</Text>
          </Veld>
        </View>
        {toon === 'oranje' ? (
          <NoticeBanner message={tx('Boven 80% van het urenbudget. Houd uren goed in de gaten.')} />
        ) : toon === 'rood' ? (
          <NoticeBanner toon="fout" message={tx('Urenbudget overschreden ({pct}%).', { pct: Math.round(o.percentage * 100) })} />
        ) : null}
      </Blok>

      <NoticeBanner
        toon="info"
        message={tx('Uren boek je op de werkbon van deze klus. Wat je hier ziet is de optelsom van de werkbonnen van dit project.')}
      />

      <Blok titel={tx('Geregistreerde uren ({n})', { n: uren.length })}>
        {uren.length === 0 ? (
          <Text style={styles.leeg}>{tx('Nog geen uren geregistreerd op dit project.')}</Text>
        ) : (
          uren.map((u) => (
            <Rij
              key={u.id}
              titel={`${formatDateNL(u.datum)} · ${u.medewerker?.full_name || tx('Onbekende medewerker')}`}
              sub={
                [
                  u.notitie ? alsTekst(u.notitie) : null,
                  u.start_tijd && u.eind_tijd ? `${u.start_tijd.slice(0, 5)}–${u.eind_tijd.slice(0, 5)}` : null,
                  Number(u.pauze_minuten) > 0 ? tx('{n} min pauze', { n: u.pauze_minuten }) : null,
                  Number(u.reis_km) > 0 ? `${Number(u.reis_km).toLocaleString(locale())
} km` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              rechts={<Text style={styles.bedrag}>{formatUren(u.uren)}</Text>}
              onPress={u.werkbon_id ? () => onWerkbon(u.werkbon_id as string) : undefined}
            />
          ))
        )}
      </Blok>
    </>
  );
}
