import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calculator, ChevronDown, Lock } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { formatEURCent } from '@/lib/format';
import { typeConfig, nummerNaarVeld, type EigenEenheid, type Regel } from '@/lib/regels';
import { markeerHandmatig } from '@/lib/boss/offerteRegels';
import {
  adviesPrijs,
  berekenCalculatie,
  getalUit,
  heeftGeenCalculatie,
  isUrenRegel,
  kostprijsPerEenheid,
  mistCalculatie,
  regelMateriaal,
  regelUren,
} from '@/lib/offerteCalculatie';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';

/**
 * De interne calculatie onder de regels van een offerte (`OfferteCalculatie`
 * in het dashboard): wat deze offerte jou kost en wat er overblijft. De klant
 * ziet hier niets van; het staat niet op de pdf en niet op de ondertekenpagina.
 *
 * Per regel uren en kostprijs per eenheid; arbeid = alle uren × de kostprijs
 * per uur van deze offerte. Op de telefoon per regel een kaartje in plaats van
 * de tabel van het dashboard.
 *
 * Gewenste marge: per regel en voor de hele offerte wat je moet vragen
 * (`adviesPrijs`, marge als deel van de verkoopprijs). Overnemen zet die prijs
 * in de regel, alleen zolang de prijzen nog te wijzigen zijn (`prijzenVast`).
 * Het percentage is een hulpmiddel: per bedrijf op het toestel onthouden.
 */

const getalNl = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 });

const margeSleutel = (id: string | null | undefined) => `bb-gewenste-marge:${id || 'x'}`;

export function OfferteCalculatie({
  regels,
  onRegels,
  kostprijsPerUur,
  onKostprijsPerUur,
  standaardKostprijs,
  eenheden = [],
  prijzenVast = false,
  bedrijfId,
}: {
  regels: Regel[];
  onRegels: (fn: (rs: Regel[]) => Regel[]) => void;
  kostprijsPerUur: string;
  onKostprijsPerUur: (v: string) => void;
  standaardKostprijs: number | null;
  eenheden?: EigenEenheid[];
  /** Verstuurd, geaccepteerd of zonder recht op regels: geen Overnemen. */
  prijzenVast?: boolean;
  bedrijfId: string | null;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const [marge, setMargeState] = useState('');
  useEffect(() => {
    let weg = false;
    AsyncStorage.getItem(margeSleutel(bedrijfId))
      .then((v) => {
        if (!weg && v) setMargeState(v);
      })
      .catch(() => {});
    return () => {
      weg = true;
    };
  }, [bedrijfId]);
  const setMarge = (v: string) => {
    setMargeState(v);
    (v ? AsyncStorage.setItem(margeSleutel(bedrijfId), v) : AsyncStorage.removeItem(margeSleutel(bedrijfId))).catch(
      () => {},
    );
  };

  const c = berekenCalculatie(regels, kostprijsPerUur);
  const [open, setOpen] = useState(() =>
    regels.some((r) => r.calc && (r.calc.urenPer !== '' || r.calc.kostprijsPer !== '')),
  );
  const zetCalc = (sleutel: string, k: 'urenPer' | 'kostprijsPer', v: string) =>
    onRegels((rs) =>
      rs.map((r) =>
        r.sleutel === sleutel ? { ...r, calc: { urenPer: '', kostprijsPer: '', ...(r.calc || {}), [k]: v } } : r,
      ),
    );
  const kpu = getalUit(kostprijsPerUur);
  const margeGetal = getalUit(marge);
  const margeGeldig = margeGetal != null && margeGetal >= 0 && margeGetal <= 95;
  const advies = (r: Regel) => (margeGeldig ? adviesPrijs(kostprijsPerEenheid(r, kpu), margeGetal) : null);
  const adviesTotaal = margeGeldig ? adviesPrijs(c.kostprijs, margeGetal) : null;
  const neemOver = (sleutels: string[]) =>
    onRegels((rs) =>
      rs.map((r) => {
        if (!sleutels.includes(r.sleutel)) return r;
        const a = advies(r);
        return a == null ? r : { ...markeerHandmatig(r, 'prijs'), prijs: nummerNaarVeld(a) };
      }),
    );
  const metAdvies = regels.filter((r) => {
    const a = advies(r);
    return a != null && Math.abs(a - (getalUit(r.prijs) || 0)) >= 0.01;
  });

  return (
    <View style={styles.blok} accessibilityLabel="Calculatie">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        style={styles.kop}
      >
        <View style={styles.kopRij}>
          <Calculator size={16} color={ds.green700} />
          <Text style={styles.titel}>Calculatie</Text>
          <View style={styles.intern}>
            <Lock size={10} color={t.muted} />
            <Text style={styles.internTekst}>Alleen voor jou</Text>
          </View>
          <View style={{ flex: 1 }} />
          <ChevronDown size={18} color={t.muted} style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }} />
        </View>
        {!open ? (
          <Text style={styles.samen}>
            Kostprijs <Text style={styles.vet}>{formatEURCent(c.kostprijs)}</Text>
            {c.verkoop > 0 ? (
              <>
                {' · resultaat '}
                <Text style={[styles.vet, c.resultaat < 0 && styles.neg]}>{formatEURCent(c.resultaat)}</Text>
                {c.marge != null ? ` (${getalNl(c.marge)}%)` : ''}
              </>
            ) : null}
          </Text>
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.inhoud}>
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>Kostprijs per uur voor deze offerte</Text>
            <TextInput
              value={kostprijsPerUur}
              onChangeText={onKostprijsPerUur}
              keyboardType="decimal-pad"
              placeholder={standaardKostprijs != null ? nummerNaarVeld(standaardKostprijs) : 'Nog niet ingesteld'}
              placeholderTextColor={t.muted2}
              accessibilityLabel="Kostprijs per uur voor deze offerte"
              style={styles.veld}
            />
            <Text style={styles.hint}>
              Wat een gewerkt uur jou kost, excl. btw. Standaard uit Instellingen; blijft bij deze offerte bewaard.
            </Text>
          </View>

          {regels.length === 0 ? (
            <Text style={styles.hint}>Nog geen regels om te calculeren.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {regels.map((r) => {
                const cfg = typeConfig(r.type, eenheden);
                const eenheid = r.eenheid || cfg.eenheid || 'eenheid';
                const uren = regelUren(r);
                const regelKost = (kpu == null ? 0 : uren * kpu) + regelMateriaal(r);
                const mist = mistCalculatie(r);
                const a = advies(r);
                const nu = getalUit(r.prijs) || 0;
                const gelijk = a != null && Math.abs(a - nu) < 0.01;
                return (
                  <View key={r.sleutel} style={[styles.regel, mist && styles.regelMist]}>
                    <View style={styles.regelKop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.regelNaam} numberOfLines={2}>
                          {r.omschrijving.trim() || cfg.omschrijvingFallback}
                        </Text>
                        <Text style={styles.hint}>
                          {getalNl(getalUit(r.aantal))} {eenheid}
                          {mist ? ' · nog geen calculatie' : ''}
                        </Text>
                      </View>
                      {heeftGeenCalculatie(r) ? null : (
                        <Text style={styles.regelKost}>{formatEURCent(regelKost)}</Text>
                      )}
                    </View>
                    {isUrenRegel(r) ? (
                      <Text style={styles.hint}>{getalNl(uren)} uur (de hoeveelheid)</Text>
                    ) : heeftGeenCalculatie(r) ? (
                      <Text style={styles.hint}>Reiskosten: geen calculatie</Text>
                    ) : (
                      <View style={styles.velden}>
                        <View style={styles.veldKolom}>
                          <Text style={styles.label}>Uren per {eenheid}</Text>
                          <TextInput
                            value={r.calc?.urenPer ?? ''}
                            onChangeText={(v) => zetCalc(r.sleutel, 'urenPer', v)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={t.muted2}
                            accessibilityLabel={`Uren per ${eenheid}: ${r.omschrijving}`}
                            style={styles.veld}
                          />
                        </View>
                        <View style={styles.veldKolom}>
                          <Text style={styles.label}>Kostprijs per {eenheid}</Text>
                          <TextInput
                            value={r.calc?.kostprijsPer ?? ''}
                            onChangeText={(v) => zetCalc(r.sleutel, 'kostprijsPer', v)}
                            keyboardType="decimal-pad"
                            placeholder="0,00"
                            placeholderTextColor={t.muted2}
                            accessibilityLabel={`Kostprijs per ${eenheid}: ${r.omschrijving}`}
                            style={styles.veld}
                          />
                        </View>
                      </View>
                    )}
                    {a != null ? (
                      <View style={styles.adviesRij}>
                        <Text style={styles.hint}>
                          Vragen per {eenheid}{' '}
                          <Text style={[styles.vet, !gelijk && nu < a && styles.neg]}>{formatEURCent(a)}</Text>
                        </Text>
                        {!gelijk && !prijzenVast ? (
                          <Pressable
                            onPress={() => neemOver([r.sleutel])}
                            accessibilityRole="button"
                            accessibilityLabel={`Prijs ${formatEURCent(a)} overnemen voor ${r.omschrijving || 'deze regel'}`}
                            style={({ pressed }) => [styles.neemKnop, pressed && { opacity: 0.7 }]}
                          >
                            <Text style={styles.neemTekst}>Overnemen</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.totaal}>
            <TotaalRij styles={styles} label="Arbeid" waarde={`${getalNl(c.uren)} uur${kpu != null ? ` × ${formatEURCent(kpu)}` : ''} = ${formatEURCent(c.arbeid)}`} />
            <TotaalRij styles={styles} label="Materiaal en inkoop" waarde={formatEURCent(c.materiaal)} />
            <TotaalRij styles={styles} label="Kostprijs" waarde={formatEURCent(c.kostprijs)} som />
            <TotaalRij styles={styles} label="Offerte excl. btw" waarde={formatEURCent(c.verkoop)} />
            <TotaalRij
              styles={styles}
              label="Verwacht resultaat"
              waarde={`${formatEURCent(c.resultaat)}${c.marge != null ? ` (${getalNl(c.marge)}%)` : ''}`}
              som
              neg={c.resultaat < 0}
            />
          </View>

          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>Gewenste marge</Text>
            <View style={styles.pctRij}>
              <TextInput
                value={marge}
                onChangeText={setMarge}
                keyboardType="decimal-pad"
                placeholder="Bijv. 25"
                placeholderTextColor={t.muted2}
                accessibilityLabel="Gewenste marge in procenten"
                style={[styles.veld, styles.pctVeld]}
              />
              <Text style={styles.pct}>%</Text>
            </View>
            <Text style={styles.hint}>
              Wat je wilt overhouden, als deel van je verkoopprijs. Bij 25% marge en € 75 kostprijs vraag je € 100.
            </Text>
            {marge !== '' && !margeGeldig ? <Text style={styles.let}>Vul een marge in tussen 0 en 95%.</Text> : null}
            {margeGeldig && adviesTotaal != null ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.tekst}>
                  Vragen voor {getalNl(margeGetal)}% marge: <Text style={styles.vet}>{formatEURCent(adviesTotaal)}</Text> excl. btw
                  {c.verkoop > 0 && Math.abs(adviesTotaal - c.verkoop) >= 0.01 ? (
                    <Text style={c.verkoop < adviesTotaal ? styles.neg : styles.hint}>
                      {` · nu ${formatEURCent(c.verkoop)}, ${
                        c.verkoop < adviesTotaal
                          ? `${formatEURCent(adviesTotaal - c.verkoop)} te weinig`
                          : `${formatEURCent(c.verkoop - adviesTotaal)} meer`
                      }`}
                    </Text>
                  ) : null}
                </Text>
                {!prijzenVast && metAdvies.length > 1 ? (
                  <Pressable
                    onPress={() => neemOver(metAdvies.map((r) => r.sleutel))}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.alleKnop, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.neemTekst}>Alle {metAdvies.length} prijzen overnemen</Text>
                  </Pressable>
                ) : null}
                {prijzenVast ? (
                  <Text style={styles.hint}>
                    De prijzen van deze offerte liggen vast. Maak een nieuwe versie om ze aan te passen.
                  </Text>
                ) : null}
              </View>
            ) : null}
            {margeGeldig && adviesTotaal == null ? (
              <Text style={styles.hint}>Vul eerst de calculatie in: zonder kostprijs is er niets uit te rekenen.</Text>
            ) : null}
          </View>

          {c.zonderKostprijsPerUur ? (
            <Text style={styles.let}>Zonder kostprijs per uur telt de arbeid niet mee in de kostprijs.</Text>
          ) : null}
          {c.regelsZonderCalculatie > 0 ? (
            <Text style={styles.let}>
              {c.regelsZonderCalculatie === 1 ? '1 regel heeft' : `${c.regelsZonderCalculatie} regels hebben`} nog geen
              uren of kostprijs. Vul ze in, anders is de kostprijs te laag.
            </Text>
          ) : null}
          <Text style={styles.hint}>
            Wordt de offerte geaccepteerd, dan is dit de begroting van het project. Op het project zie je onder
            Nacalculatie wat het werkelijk kost.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TotaalRij({
  styles,
  label,
  waarde,
  som,
  neg,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  waarde: string;
  som?: boolean;
  neg?: boolean;
}) {
  return (
    <View style={[styles.totaalRij, som && styles.totaalSom]}>
      <Text style={[styles.totaalLabel, som && styles.vet]}>{label}</Text>
      <Text style={[styles.totaalWaarde, som && styles.vet, neg && styles.neg]}>{waarde}</Text>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    blok: {
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: radius.lg,
      backgroundColor: t.card,
      overflow: 'hidden',
    },
    kop: { padding: spacing.md, gap: 4, minHeight: 44, justifyContent: 'center' },
    kopRij: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    titel: { ...typography.rowTitle, color: t.ink },
    intern: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: t.statusDraftBg,
    },
    internTekst: { fontSize: 11, fontWeight: '600', color: t.statusDraftFg },
    samen: { ...typography.small, color: t.muted },
    vet: { fontWeight: '700', color: t.ink },
    neg: { color: t.statusRejectFg },
    inhoud: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
    label: { ...typography.label, color: t.muted2 },
    hint: { ...typography.small, color: t.muted },
    tekst: { ...typography.small, color: t.ink2 },
    let: { ...typography.small, color: t.statusWarnFg },
    veld: {
      minHeight: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: spacing.xs,
      fontSize: 15,
      color: t.ink,
      backgroundColor: t.card,
    },
    regel: {
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      backgroundColor: t.bgAlt,
    },
    regelMist: { borderColor: t.statusWarnStripe },
    regelKop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    regelNaam: { fontSize: 14, fontWeight: '600', color: t.ink },
    regelKost: { fontSize: 14, fontWeight: '700', color: t.ink, fontVariant: ['tabular-nums'] },
    velden: { flexDirection: 'row', gap: spacing.sm },
    veldKolom: { flex: 1, gap: 4, minWidth: 0 },
    adviesRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    neemKnop: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.green600,
      backgroundColor: t.green50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alleKnop: {
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.green600,
      backgroundColor: t.green50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    neemTekst: { fontSize: 13, fontWeight: '700', color: t.greenInk },
    totaal: { gap: 6, paddingTop: spacing.xs },
    totaalRij: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
    totaalSom: { borderTopWidth: 1, borderTopColor: t.line, paddingTop: 6 },
    totaalLabel: { ...typography.small, color: t.ink2, flexShrink: 0 },
    totaalWaarde: { ...typography.small, color: t.ink2, textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] },
    pctRij: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pctVeld: { width: 110 },
    pct: { fontSize: 15, fontWeight: '600', color: t.ink2 },
  });
