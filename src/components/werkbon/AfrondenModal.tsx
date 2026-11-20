import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Square } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { MobielKader } from '@/components/MobielKader';
import { PdfWeergave, type PdfDocument } from '@/components/PdfWeergave';
import { useFocusTerug } from '@/lib/focusTerug';
import { formatHours } from '@/lib/format';
import { rond2 } from '@/lib/werkbonLogica';
import { EMAIL_RE, type SignResultaat } from '@/lib/werkbonVersturen';
import { mailTerOndertekening, tekenOpToestel } from '@/services/werkbonOndertekenenService';
import { heeftMeerwerkBedragVoorKlant } from '@/services/meerwerkPrijsService';
import type { Werkbon } from '@/services/workOrderService';
import type { WorkOrderTask } from '@/types/domain';
import { tx, txn } from '@/i18n';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';
import { HandtekeningVak } from './HandtekeningVak';

export type AfrondUitkomst =
  | { soort: 'ondertekend'; resultaat: SignResultaat }
  | { soort: 'gemaild'; email: string }
  | { soort: 'zonderHandtekening' };

type Stap = 'overzicht' | 'tekenen' | 'mailen';

/**
 * Klus afronden met de handtekening van de klant (WerkbonAfrondenModal in het
 * dashboard). Drie uitkomsten, in volgorde van wenselijkheid:
 *   1. de klant tekent hier → afgerond én ondertekend (Edge Function
 *      sign-werkbon), de bon gaat op slot;
 *   2. de klant is weg → link per mail, de bon blijft open tot hij tekent;
 *   3. geen handtekening nodig → gewoon afronden.
 * Geen bedragen in beeld: de klant kijkt mee. (Alleen het meerwerkbedrag staat
 * op de bon zelf, als er een is gerekend.)
 */
export function AfrondenModal({
  werkbon,
  taken,
  aantalUren,
  urenGeboekt,
  aantalMateriaal,
  aantalFotos,
  aantalKlantNotities,
  onTaakToggle,
  onZonderHandtekening,
  onKlaar,
  onClose,
}: {
  werkbon: Werkbon;
  /** Gewone taken (geen meerwerk). */
  taken: WorkOrderTask[];
  aantalUren: number;
  urenGeboekt: boolean;
  aantalMateriaal: number;
  aantalFotos: number;
  aantalKlantNotities: number;
  onTaakToggle?: (t: WorkOrderTask) => Promise<void>;
  /** Uitkomst 3; geeft een foutmelding terug of null. */
  onZonderHandtekening: () => Promise<string | null>;
  onKlaar: (u: AfrondUitkomst) => void;
  onClose: () => void;
}) {
  useFocusTerug(true);
  const { colors: th } = useTheme();
  const styles = useMemo(() => maakStijl(th), [th]);
  const [stap, setStapRuw] = useState<Stap>('overzicht');
  const [naam, setNaam] = useState(werkbon.customer?.name ?? '');
  const [email, setEmail] = useState(werkbon.customer?.email ?? '');
  const [handtekening, setHandtekening] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [taakBezig, setTaakBezig] = useState<string | null>(null);
  const [tekent, setTekent] = useState(false);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);

  // Bij elke stapwissel de oude melding weg.
  const setStap = (s: Stap) => {
    setFout('');
    setStapRuw(s);
  };

  const open = taken.filter((t) => !t.afgerond);
  // Hele zin vertalen; {vet} wordt het vetgedrukte stuk.
  const geenBedragen = tx('Op de werkbon staan {vet}: geen prijzen, geen tarieven, geen inkoop.').split('{vet}');
  // Heeft meerwerk een bedrag, dan staat dat wél op de bon (Niels, 20-11-2026).
  const [meerwerkBedrag, setMeerwerkBedrag] = useState(false);
  const signToken = werkbon.sign_token;
  useEffect(() => {
    let alive = true;
    void heeftMeerwerkBedragVoorKlant(signToken).then((ja) => { if (alive) setMeerwerkBedrag(ja); });
    return () => { alive = false; };
  }, [signToken]);
  const sluit = () => !bezig && onClose();

  const onderteken = async () => {
    setFout('');
    if (!naam.trim()) return setFout(tx('Vul de naam van de ondertekenaar in.'));
    if (!EMAIL_RE.test(email.trim())) return setFout(tx('Vul een geldig e-mailadres in — daar gaat de bevestiging heen.'));
    if (!handtekening) return setFout(tx('Laat de klant eerst tekenen.'));
    setBezig(true);
    const { data, error } = await tekenOpToestel(werkbon, { naam, email, handtekening });
    setBezig(false);
    if (error || !data) return setFout(error ?? tx('Ondertekenen mislukt'));
    onKlaar({ soort: 'ondertekend', resultaat: data });
  };

  const mailen = async () => {
    setFout('');
    setBezig(true);
    const { data, error } = await mailTerOndertekening(werkbon, email);
    setBezig(false);
    if (error || !data) return setFout(error ?? tx('Versturen mislukt'));
    onKlaar({ soort: 'gemaild', email: data.email });
  };

  const zonder = async () => {
    setFout('');
    setBezig(true);
    const e = await onZonderHandtekening();
    setBezig(false);
    if (e) return setFout(e);
    onKlaar({ soort: 'zonderHandtekening' });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={sluit} presentationStyle="formSheet">
      <MobielKader soort="formulier">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: th.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.kop}>
            <Pressable onPress={sluit} hitSlop={8} style={styles.minTouch} accessibilityRole="button" disabled={bezig}>
              <Text style={styles.annuleer}>{tx('Annuleren')}</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.titel} numberOfLines={1}>
                {stap === 'mailen' ? tx('Ter ondertekening sturen') : tx('Klus afronden')}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {werkbon.nummer ? `${werkbon.nummer} · ` : ''}
                {werkbon.titel}
              </Text>
            </View>
            <View style={{ width: 64 }} />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" scrollEnabled={!tekent}>
            {/* Samenvatting — wat de klant straks op de bon ziet */}
            <View style={styles.cijfers}>
              <Cijfer styles={styles} label={tx('Taken')} waarde={`${taken.filter((t) => t.afgerond).length}/${taken.length}`} />
              <Cijfer styles={styles} label={tx('Uren')} waarde={formatHours(rond2(aantalUren))} />
              <Cijfer styles={styles} label={tx('Materiaal')} waarde={String(aantalMateriaal)} />
              <Cijfer styles={styles} label={tx('Foto\'s')} waarde={String(aantalFotos)} />
            </View>

            {/* Openstaande taken: aftikken kost één tik, achteraf kan het niet meer. */}
            {open.length > 0 ? (
              <View style={styles.waarschuwing}>
                <Text style={styles.waarschuwingKop}>
                  {txn('Eén taak staat nog open', '{n} taken staan nog open', open.length)}
                </Text>
                {open.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={async () => {
                      if (!onTaakToggle || bezig || taakBezig) return;
                      setTaakBezig(t.id);
                      try {
                        await onTaakToggle(t);
                      } finally {
                        setTaakBezig(null);
                      }
                    }}
                    disabled={!onTaakToggle || bezig || !!taakBezig}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: false, disabled: !onTaakToggle || bezig }}
                    aria-checked={false}
                    style={[styles.taak, taakBezig === t.id && { opacity: 0.5 }]}
                  >
                    {taakBezig === t.id ? <ActivityIndicator size="small" color="#9A3412" /> : <Square size={18} color="#9A3412" />}
                    <Text style={styles.taakTekst}>{t.omschrijving}</Text>
                  </Pressable>
                ))}
                <Text style={styles.waarschuwingTekst}>
                  {tx('Deze taken komen niet op de bon die de klant tekent. Vink af wat je wél hebt gedaan — na ondertekenen ligt de bon vast en kan dat niet meer.')}
                </Text>
              </View>
            ) : null}

            {!urenGeboekt ? (
              <View style={styles.waarschuwing}>
                <Text style={styles.waarschuwingTekst}>
                  {tx('Er zijn nog geen uren op deze werkbon geboekt. Na ondertekenen kan dat niet meer — de bon gaat dan op slot.')}
                </Text>
              </View>
            ) : null}

            <View style={styles.info}>
              <Text style={styles.infoTekst}>
                {meerwerkBedrag ? (
                  tx('Op de werkbon staat alleen het bedrag bij het meerwerk: geen andere prijzen, geen tarieven, geen inkoop.')
                ) : (
                  <>
                    {geenBedragen[0]}
                    <Text style={{ fontWeight: '800' }}>{tx('geen bedragen')}</Text>
                    {geenBedragen[1]}
                  </>
                )}{' '}
                {aantalKlantNotities > 0
                  ? txn('Wel één notitie die je als "voor de klant" hebt gemarkeerd.', 'Wel {n} notities die je als "voor de klant" hebt gemarkeerd.', aantalKlantNotities)
                  : tx('Interne notities blijven intern.')}
              </Text>
            </View>

            <Button
              label={tx('Bekijk de bon zoals de klant hem ziet')}
              variant="secondary"
              onPress={() =>
                setPdf({ soort: 'werkbon', id: werkbon.id, titel: tx('Werkbon {nummer}', { nummer: werkbon.nummer ?? '' }).trim(), opgeslagenEerst: false })
              }
              disabled={bezig}
            />

            {stap === 'tekenen' ? (
              <>
                <FormField label={tx('Naam ondertekenaar')} value={naam} onChangeText={setNaam} placeholder={tx('Naam van de klant')} editable={!bezig} />
                <FormField
                  label={tx('E-mailadres')}
                  hint={tx('Hier gaat de ondertekende werkbon als bevestiging heen.')}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={tx('klant@voorbeeld.nl')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!bezig}
                />
                <HandtekeningVak onChange={setHandtekening} disabled={bezig} onTekenen={setTekent} />
              </>
            ) : null}

            {stap === 'mailen' ? (
              <FormField
                label={tx('E-mailadres klant')}
                hint={tx('De klant krijgt de werkbon als PDF én een link om te tekenen. De werkbon blijft open tot hij getekend heeft.')}
                value={email}
                onChangeText={setEmail}
                placeholder={tx('klant@voorbeeld.nl')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                editable={!bezig}
              />
            ) : null}

            {fout ? <Text style={styles.fout}>{fout}</Text> : null}

            {stap === 'overzicht' ? (
              <View style={{ gap: spacing.sm }}>
                <Button label={tx('Klant tekent nu')} onPress={() => setStap('tekenen')} disabled={bezig} />
                <Button label={tx('Per mail')} variant="secondary" onPress={() => setStap('mailen')} disabled={bezig} />
                <Button label={tx('Zonder handtekening')} variant="ghost" onPress={zonder} loading={bezig} />
              </View>
            ) : stap === 'tekenen' ? (
              <View style={{ gap: spacing.sm }}>
                <Button label={tx('Ondertekenen en afronden')} onPress={onderteken} loading={bezig} disabled={!handtekening} />
                <Button label={tx('Terug')} variant="ghost" onPress={() => setStap('overzicht')} disabled={bezig} />
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <Button label={tx('Versturen')} onPress={mailen} loading={bezig} disabled={!email} />
                <Button label={tx('Terug')} variant="ghost" onPress={() => setStap('overzicht')} disabled={bezig} />
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </MobielKader>
      <PdfWeergave document={pdf} onSluit={() => setPdf(null)} />
    </Modal>
  );
}

function Cijfer({ styles, label, waarde }: { styles: ReturnType<typeof maakStijl>; label: string; waarde: string }) {
  return (
    <View style={styles.cijfer}>
      <Text style={styles.cijferLabel}>{label}</Text>
      <Text style={styles.cijferWaarde}>{waarde}</Text>
    </View>
  );
}

const maakStijl = (t: ThemeColors) =>
  StyleSheet.create({
    kop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
      gap: 8,
    },
    minTouch: { minHeight: 44, justifyContent: 'center' },
    annuleer: { fontSize: 15, color: t.muted, minWidth: 64 },
    titel: { fontSize: 17, fontWeight: '700', color: t.ink, letterSpacing: -0.3 },
    sub: { fontSize: 12, color: t.muted, marginTop: 2 },
    body: { padding: spacing.lg, gap: spacing.lg, backgroundColor: t.bg },
    cijfers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    cijfer: { flexGrow: 1, flexBasis: '40%', backgroundColor: t.bgAlt, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11 },
    cijferLabel: { fontSize: 11, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    cijferWaarde: { fontSize: 16, fontWeight: '700', color: t.ink, marginTop: 2 },
    waarschuwing: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74', borderRadius: 8, padding: 12, gap: 6 },
    waarschuwingKop: { fontSize: 13, fontWeight: '700', color: '#9A3412' },
    waarschuwingTekst: { fontSize: 12.5, lineHeight: 18, color: '#9A3412' },
    taak: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, minHeight: 36, paddingVertical: 6 },
    taakTekst: { flex: 1, fontSize: 14, lineHeight: 20, color: '#7C2D12' },
    info: { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD', borderRadius: 8, padding: 12 },
    infoTekst: { fontSize: 12.5, lineHeight: 18, color: '#075985' },
    fout: { fontSize: 13, color: '#b91c1c', fontWeight: '600' },
  });

