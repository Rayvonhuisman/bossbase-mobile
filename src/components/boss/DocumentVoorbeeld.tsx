/**
 * Het document zoals de klant het leest: kop, klant, regels per groep,
 * totalen. Alleen weergave; bewerken gaat via de velden. Zelfde opbouw als
 * `DocumentVoorbeeld` in het dashboard. Wat nog ontbreekt staat geel.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/providers';
import { formatEURCent } from '@/lib/format';
import { berekenTotalen, regelprijs, typeConfig, type EigenEenheid, type Groep, type Regel } from '@/lib/regels';
import { isLegeRegel, ontbreektIn } from '@/lib/boss/offerteRegels';
import { prijsOntbreekt } from '@/lib/boss/factuurRegels';
import type { ThemeColors } from '@/theme';

type Klant = { name?: string | null; address?: string | null; postcode?: string | null; city?: string | null } | null;

export function DocumentVoorbeeld({
  soort, nummer, klant, datums, omschrijving, regels, groepen = [], opmerking, eenheden = [],
}: {
  soort: 'offerte' | 'factuur';
  nummer?: string | null;
  klant: Klant;
  datums: { label: string; waarde: string }[];
  omschrijving?: string;
  regels: Regel[];
  groepen?: Groep[];
  opmerking?: string;
  eenheden?: EigenEenheid[];
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const echt = regels.filter((r) => !isLegeRegel(r));
  const totalen = berekenTotalen(echt);

  // Regels zonder groep bovenaan, daarna per groep (offerte); bij een factuur
  // de groep zoals hij op de regel staat.
  const blokken: { naam: string; werk: string; regels: Regel[] }[] = [];
  const bekend = new Map(groepen.map((g) => [g.id, g]));
  if (soort === 'offerte') {
    blokken.push({ naam: '', werk: '', regels: echt.filter((r) => !r.groepId || !bekend.has(r.groepId)) });
    for (const g of groepen) blokken.push({ naam: g.naam || 'Groep', werk: g.werkzaamheden, regels: echt.filter((r) => r.groepId === g.id) });
  } else {
    for (const r of echt) {
      const naam = r.groep?.naam || '';
      const laatste = blokken[blokken.length - 1];
      if (laatste && laatste.naam === naam) laatste.regels.push(r);
      else blokken.push({ naam, werk: r.groep?.werkzaamheden || '', regels: [r] });
    }
  }

  const mist = (r: Regel) => ontbreektIn(r).length > 0 || prijsOntbreekt(r);
  const aantal = (r: Regel) => {
    if (String(r.aantal).trim() === '') return '—';
    const eenheid = r.eenheid || typeConfig(r.type, eenheden).eenheid;
    return `${r.aantal}${eenheid ? ` ${eenheid}` : ''}`;
  };

  return (
    <View style={s.vel} accessibilityLabel={`Voorbeeld van de ${soort}`}>
      <View style={s.kop}>
        <View>
          <Text style={s.soort}>{soort === 'offerte' ? 'Offerte' : 'Factuur'}</Text>
          {nummer ? <Text style={s.nummer}>{nummer}</Text> : null}
        </View>
        <View style={{ gap: 2, alignItems: 'flex-end' }}>
          {datums.filter((d) => d.waarde).map((d) => (
            <Text key={d.label} style={s.datum}>{d.label} <Text style={s.datumWaarde}>{d.waarde}</Text></Text>
          ))}
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={s.lbl}>AAN</Text>
        {klant?.name ? (
          <>
            <Text style={s.klant}>{klant.name}</Text>
            {klant.address ? <Text style={s.tekst}>{klant.address}</Text> : null}
            {klant.postcode || klant.city ? <Text style={s.tekst}>{[klant.postcode, klant.city].filter(Boolean).join(' ')}</Text> : null}
          </>
        ) : <Text style={s.leeg}>Nog geen klant gekozen</Text>}
      </View>
      {omschrijving ? <Text style={s.tekst}>{omschrijving}</Text> : null}
      {echt.length === 0 ? <Text style={s.leeg}>Nog geen regels.</Text> : (
        <View style={{ gap: 2 }}>
          {blokken.filter((b) => b.regels.length).map((b, i) => (
            <View key={`${b.naam}-${i}`} style={{ gap: 2 }}>
              {b.naam ? (
                <View style={s.groep}>
                  <Text style={s.groepNaam}>{b.naam}</Text>
                  {b.werk ? <Text style={s.groepWerk}>{b.werk}</Text> : null}
                </View>
              ) : null}
              {b.regels.map((r) => (
                <View key={r.sleutel} style={[s.regel, mist(r) && s.regelMist]}>
                  <Text style={s.regelOms}>{r.omschrijving}</Text>
                  <Text style={s.regelAantal}>{aantal(r)}</Text>
                  <Text style={s.regelBedrag}>{mist(r) ? '—' : formatEURCent(regelprijs(r))}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      <View style={s.totalen}>
        <View style={s.totRij}><Text style={s.totLabel}>Subtotaal excl. btw</Text><Text style={s.totWaarde}>{formatEURCent(totalen.excl)}</Text></View>
        {totalen.btwPerTarief.filter((b) => b.bedrag > 0).map((b) => (
          <View key={b.pct} style={s.totRij}><Text style={s.totLabel}>Btw {b.pct}%</Text><Text style={s.totWaarde}>{formatEURCent(b.bedrag)}</Text></View>
        ))}
        <View style={[s.totRij, s.eind]}><Text style={s.eindLabel}>Totaal incl. btw</Text><Text style={s.eindLabel}>{formatEURCent(totalen.incl)}</Text></View>
      </View>
      {opmerking ? <Text style={[s.tekst, s.opmerking]}>{opmerking}</Text> : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    vel: { backgroundColor: t.card, borderRadius: t.rLg, padding: 18, gap: 16 },
    kop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    soort: { fontSize: 22, fontWeight: '700', color: t.ink },
    nummer: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    datum: { fontSize: 12, color: t.muted },
    datumWaarde: { color: t.ink, fontWeight: '600' },
    lbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.88, color: t.muted2 },
    klant: { fontSize: 14.5, fontWeight: '700', color: t.ink },
    tekst: { fontSize: 14, lineHeight: 20, color: t.ink2 },
    leeg: { fontSize: 14, fontStyle: 'italic', color: t.muted2 },
    groep: { paddingTop: 10, paddingBottom: 2 },
    groepNaam: { fontSize: 14, fontWeight: '700', color: t.ink },
    groepWerk: { fontSize: 12.5, color: t.muted },
    regel: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.lineStrong },
    regelMist: { backgroundColor: t.statusWarnBg },
    regelOms: { flex: 1, fontSize: 13.5, color: t.ink },
    regelAantal: { fontSize: 13.5, color: t.ink2, fontVariant: ['tabular-nums'] },
    regelBedrag: { width: 92, textAlign: 'right', fontSize: 13.5, color: t.ink, fontVariant: ['tabular-nums'] },
    totalen: { gap: 4, alignSelf: 'flex-end', width: '70%', maxWidth: 320 },
    totRij: { flexDirection: 'row', justifyContent: 'space-between' },
    totLabel: { fontSize: 13, color: t.muted },
    totWaarde: { fontSize: 13, color: t.ink, fontVariant: ['tabular-nums'] },
    eind: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.lineStrong, paddingTop: 8, marginTop: 4 },
    eindLabel: { fontSize: 15, fontWeight: '700', color: t.ink, fontVariant: ['tabular-nums'] },
    opmerking: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.lineStrong, paddingTop: 12 },
  });
