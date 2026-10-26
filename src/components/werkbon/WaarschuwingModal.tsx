import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { MobielKader } from '@/components/MobielKader';
import { VelStatusbalk } from '@/components/VelStatusbalk';
import { Dialog } from '@/lib/dialog';
import { useFocusTerug } from '@/lib/focusTerug';
import type { MailBedrijf } from '@/lib/werkbonVersturen';
import {
  constateringUit,
  mailBedrijf,
  stuurWaarschuwing,
  waarschuwingVoorbeeld,
} from '@/services/werkbonOndertekenenService';
import type { Werkbon, WerkbonNotitie } from '@/services/workOrderService';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';
import { MailVoorbeeld } from './MailVoorbeeld';

const ROOD = '#dc2626';

/**
 * Wkb-waarschuwing voor de klant (WaarschuwingModal in het dashboard): wat je
 * hebt geconstateerd en wat daarvan het gevolg kan zijn, als twee velden. Eerst
 * het voorbeeld (dezelfde functie die de echte mail bouwt), dan versturen. De
 * mail gaat eerst; pas daarna legt de app vast dát en waarheen er is
 * gewaarschuwd. Het gevolg is bewust niet verplicht.
 */
export function WaarschuwingModal({
  werkbon,
  notitie,
  onClose,
  onVerstuurd,
}: {
  werkbon: Werkbon;
  notitie: WerkbonNotitie;
  onClose: () => void;
  onVerstuurd: (bij: WerkbonNotitie) => void;
}) {
  useFocusTerug(true);
  const { colors: th } = useTheme();
  const styles = useMemo(() => maakStijl(th), [th]);
  const [stap, setStap] = useState<'invoer' | 'voorbeeld'>('invoer');
  const [constatering, setConstatering] = useState(constateringUit(notitie.note));
  const [gevolg, setGevolg] = useState(alsTekstOfLeeg(notitie.gevolg));
  const [email, setEmail] = useState(werkbon.customer?.email ?? '');
  const [bedrijf, setBedrijf] = useState<MailBedrijf | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const klantNaam = werkbon.customer?.name ?? '';

  useEffect(() => {
    let actief = true;
    mailBedrijf(werkbon.company_id).then((b) => actief && setBedrijf(b));
    return () => {
      actief = false;
    };
  }, [werkbon.company_id]);

  const voorbeeld = useMemo(
    () => (stap === 'voorbeeld' ? waarschuwingVoorbeeld(werkbon, bedrijf, constatering, gevolg) : null),
    [stap, werkbon, bedrijf, constatering, gevolg],
  );

  const naarVoorbeeld = () => {
    setFout('');
    if (!constatering.trim()) return setFout('Beschrijf wat je hebt geconstateerd');
    if (!email.trim()) return setFout('Vul een e-mailadres in');
    setStap('voorbeeld');
  };

  const versturen = async () => {
    setBezig(true);
    setFout('');
    const { data, error } = await stuurWaarschuwing(werkbon, notitie, {
      constatering: constatering.trim(),
      gevolg: gevolg.trim(),
      email: email.trim(),
    });
    setBezig(false);
    if (error || !data) return setFout(error ?? 'Versturen mislukt');
    onVerstuurd(data);
    Dialog.alert('Waarschuwing verstuurd en vastgelegd');
  };

  const sluit = () => !bezig && onClose();

  return (
    <Modal visible animationType="slide" onRequestClose={sluit} presentationStyle="formSheet">
      <VelStatusbalk />
      <MobielKader soort="formulier">
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <View style={styles.kop}>
            <Pressable onPress={sluit} hitSlop={8} style={styles.minTouch} accessibilityRole="button" disabled={bezig}>
              <Text style={styles.annuleer}>{stap === 'voorbeeld' ? 'Sluiten' : 'Annuleren'}</Text>
            </Pressable>
            <View style={styles.titelRij}>
              <AlertTriangle size={16} color={ROOD} strokeWidth={2.2} />
              <Text style={styles.titel} numberOfLines={1}>
                {stap === 'voorbeeld' ? 'Zo krijgt de klant hem' : 'Waarschuwing voor klant'}
              </Text>
            </View>
            <View style={{ width: 64 }} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            {stap === 'invoer' ? (
              <>
                <View style={styles.uitleg}>
                  <Text style={styles.uitlegTekst}>
                    {klantNaam ? `${klantNaam} krijgt ` : 'De klant krijgt '}
                    een mail met deze melding. Die geldt als schriftelijke waarschuwing, en wij leggen vast wanneer en waarheen hij
                    is verstuurd.
                  </Text>
                </View>
                <FormField
                  label="Wat heb je geconstateerd?"
                  value={constatering}
                  onChangeText={setConstatering}
                  multiline
                  placeholder="Bijvoorbeeld: houtrot in de dakrand aan de achterzijde, over ongeveer 3 meter"
                />
                <FormField
                  label="Wat kan daarvan het gevolg zijn?"
                  value={gevolg}
                  onChangeText={setGevolg}
                  multiline
                  placeholder="Bijvoorbeeld: lekkage op termijn, of het dak kan hier niet op worden gelegd"
                  hint="Een waarschuwing staat juridisch sterker als hier staat wat er kan gebeuren. Leeg laten mag."
                />
                <FormField
                  label="Naar welk e-mailadres?"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="klant@voorbeeld.nl"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {fout ? <Text style={styles.fout}>{fout}</Text> : null}
                <Pressable
                  onPress={naarVoorbeeld}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.rodeKnop, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.rodeKnopTekst}>Bekijken en versturen</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.aan}>
                  Aan <Text style={{ fontWeight: '700' }}>{email}</Text> — onderwerp:{' '}
                  <Text style={{ fontWeight: '700' }}>{voorbeeld?.onderwerp}</Text>
                </Text>
                {voorbeeld ? <MailVoorbeeld html={voorbeeld.html} /> : null}
                {fout ? <Text style={styles.fout}>{fout}</Text> : null}
                <Pressable
                  onPress={versturen}
                  disabled={bezig}
                  accessibilityRole="button"
                  accessibilityState={{ busy: bezig, disabled: bezig }}
                  style={({ pressed }) => [styles.rodeKnop, (pressed || bezig) && { opacity: 0.85 }]}
                >
                  <Text style={styles.rodeKnopTekst}>{bezig ? 'Versturen…' : 'Nu versturen'}</Text>
                </Pressable>
                <Button label="Terug" variant="ghost" onPress={() => setStap('invoer')} disabled={bezig} />
              </>
            )}
          </ScrollView>
        </View>
      </MobielKader>
    </Modal>
  );
}

function alsTekstOfLeeg(v: string | null | undefined) {
  return v ? constateringUit(v) : '';
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
    titelRij: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    titel: { fontSize: 17, fontWeight: '700', color: t.ink, letterSpacing: -0.3, flexShrink: 1 },
    body: { padding: spacing.lg, gap: spacing.lg, backgroundColor: t.bg },
    uitleg: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 8, padding: 12 },
    uitlegTekst: { fontSize: 12.5, lineHeight: 18, color: '#92400E' },
    aan: { fontSize: 13, color: t.ink2, lineHeight: 19 },
    fout: { fontSize: 13, color: '#b91c1c', fontWeight: '600' },
    rodeKnop: {
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ROOD,
    },
    rodeKnopTekst: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
