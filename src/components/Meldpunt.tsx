import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Bug, Gift, ImagePlus, Lightbulb, X } from 'lucide-react-native';
import { useTheme } from '@/providers';
import {
  getMeldactie,
  MAX_LENGTE,
  MAX_SCREENSHOT_BYTES,
  MIN_LENGTE,
  verstuurMelding,
  type Meldactie,
  type MeldSoort,
} from '@/services/meldpuntService';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';
import { Button } from './Button';
import { Paneel } from './Paneel';

const VOORWAARDEN =
  'Deelname staat open voor gebruikers van BossBase. De prijzen worden verdeeld onder de eerste 1500 klanten die iets doorgeven. Je mag zoveel meldingen doen als je wilt: elke melding geeft extra kans om te winnen. Winnaars worden door ons gekozen uit de ingezonden meldingen en krijgen persoonlijk bericht. Over de uitslag kan niet worden gecorrespondeerd.';

const TOEGESTAAN = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * "Bug of idee" — hetzelfde meldformulier als het dashboard (`Meldpunt.jsx`):
 * soort, omschrijving (5–5000 tekens), optioneel een schermafbeelding, en de
 * prijsactie als die aan staat. Versturen loopt via de Edge Function
 * `meldpunt`; de server stuurt BossBase een mail en de melder een bevestiging.
 */
export function Meldpunt({ open, pagina, onSluit }: { open: boolean; pagina: string; onSluit: () => void }) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [soort, setSoort] = useState<MeldSoort>('bug');
  const [tekst, setTekst] = useState('');
  const [foto, setFoto] = useState<{ uri: string; type: string; data: string } | null>(null);
  const [actie, setActie] = useState<Meldactie>(null);
  const [voorwaarden, setVoorwaarden] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<{ nummer: number | null; bevestigd: boolean; actie: boolean } | null>(null);

  // Net als het dashboard: de actie bij elk openen opnieuw lezen.
  useEffect(() => {
    if (!open) return;
    let weg = false;
    void getMeldactie().then((a) => !weg && setActie(a));
    return () => {
      weg = true;
    };
  }, [open]);

  const opnieuw = () => {
    setSoort('bug');
    setTekst('');
    setFoto(null);
    setFout(null);
    setKlaar(null);
  };
  const sluit = () => {
    if (bezig) return;
    onSluit();
    opnieuw();
  };

  const kiesFoto = async () => {
    setFout(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, base64: true });
    if (r.canceled) return;
    const a = r.assets?.[0];
    if (!a?.base64) return setFout('De afbeelding kon niet worden gelezen.');
    const type = a.mimeType ?? 'image/jpeg';
    if (!TOEGESTAAN.includes(type)) return setFout('Alleen PNG, JPG of WebP.');
    if (a.base64.length * 0.75 > MAX_SCREENSHOT_BYTES) return setFout('Deze afbeelding is te groot (max. 5 MB).');
    setFoto({ uri: a.uri, type, data: a.base64 });
  };

  const verstuur = async () => {
    if (tekst.trim().length < MIN_LENGTE || bezig) return;
    setBezig(true);
    setFout(null);
    const r = await verstuurMelding({
      soort,
      omschrijving: tekst,
      pagina,
      screenshot: foto ? { type: foto.type, data: foto.data } : null,
    });
    setBezig(false);
    if (!r.ok) return setFout(r.melding);
    setKlaar(r);
  };

  const kanVersturen = tekst.trim().length >= MIN_LENGTE && !bezig;

  return (
    <Paneel
      open={open}
      titel={klaar ? 'Bedankt!' : 'Bug of idee?'}
      subtitel={klaar ? undefined : 'Meld het en help BossBase beter maken'}
      onSluit={sluit}
      voet={
        klaar ? (
          <View style={styles.knoppen}>
            <Button label="Nog iets melden" variant="secondary" onPress={opnieuw} style={{ flex: 1 }} />
            <Button label="Sluiten" onPress={sluit} style={{ flex: 1 }} />
          </View>
        ) : (
          <View style={styles.knoppen}>
            <Button label="Annuleren" variant="secondary" onPress={sluit} disabled={bezig} style={{ flex: 1 }} />
            <Button label="Melding versturen" onPress={() => void verstuur()} loading={bezig} disabled={!kanVersturen} style={{ flex: 1 }} />
          </View>
        )
      }
    >
      <ScrollView contentContainerStyle={styles.inhoud} keyboardShouldPersistTaps="handled">
        {klaar ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.tekst}>Je melding is binnen.</Text>
            {klaar.nummer != null ? (
              <Text style={styles.tekst}>
                We hebben hem ontvangen onder nummer <Text style={styles.vet}>{klaar.nummer}</Text>.
              </Text>
            ) : null}
            {klaar.bevestigd ? <Text style={styles.tekst}>Je krijgt ook een bevestiging per mail.</Text> : null}
            {klaar.actie ? <Text style={styles.tekst}>Je doet mee aan de actie. Succes!</Text> : null}
          </View>
        ) : (
          <>
            <View style={styles.soorten} accessibilityRole="radiogroup">
              {(
                [
                  ['bug', Bug, 'Bug', 'Iets werkt niet zoals het hoort'],
                  ['idee', Lightbulb, 'Idee', 'Iets wat BossBase beter zou maken'],
                ] as const
              ).map(([waarde, Icoon, label, uitleg]) => {
                const actief = soort === waarde;
                return (
                  <Pressable
                    key={waarde}
                    onPress={() => setSoort(waarde)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: actief }}
                    style={[styles.soort, actief && styles.soortActief]}
                  >
                    <Icoon size={18} color={actief ? t.green700 : t.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.soortLabel}>{label}</Text>
                      <Text style={styles.soortUitleg}>{uitleg}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Omschrijving</Text>
              <TextInput
                value={tekst}
                onChangeText={setTekst}
                maxLength={MAX_LENGTE}
                multiline
                placeholder={soort === 'bug' ? 'Wat ging er mis, en wat deed je op dat moment?' : 'Wat zou je willen, en waarom?'}
                placeholderTextColor={t.muted2}
                style={styles.veld}
                accessibilityLabel="Omschrijving"
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Schermafbeelding (optioneel)</Text>
              {foto ? (
                <View style={styles.fotoRij}>
                  <Image source={{ uri: foto.uri }} style={styles.foto} accessibilityLabel="Gekozen schermafbeelding" />
                  <Pressable onPress={() => setFoto(null)} accessibilityRole="button" accessibilityLabel="Afbeelding weghalen" style={styles.fotoWeg}>
                    <X size={16} color={t.ink2} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => void kiesFoto()} accessibilityRole="button" style={styles.fotoKies}>
                  <ImagePlus size={18} color={t.ink2} />
                  <Text style={styles.fotoKiesTekst}>Afbeelding kiezen</Text>
                </Pressable>
              )}
            </View>

            {actie ? (
              <View style={styles.actie}>
                <View style={styles.actieKop}>
                  <Gift size={18} color={t.green700} />
                  <Text style={styles.vet}>Wie een melding doet, maakt kans op:</Text>
                </View>
                {actie.prijzen.map((p) => (
                  <Text key={p} style={styles.tekst}>
                    • {p}
                  </Text>
                ))}
                <Pressable onPress={() => setVoorwaarden((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: voorwaarden }}>
                  <Text style={styles.link}>{voorwaarden ? 'Voorwaarden verbergen' : 'Voorwaarden'}</Text>
                </Pressable>
                {voorwaarden ? <Text style={styles.klein}>{VOORWAARDEN}</Text> : null}
              </View>
            ) : null}

            <Text style={styles.klein}>
              We sturen automatisch mee: je bedrijf, je naam, deze pagina, je abonnement en je apparaat.
            </Text>
            {fout ? (
              <View style={styles.fout} accessibilityRole="alert">
                <Text style={styles.foutTekst}>{fout}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Paneel>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    inhoud: { padding: spacing.lg, gap: spacing.lg },
    knoppen: { flexDirection: 'row', gap: spacing.sm },
    soorten: { gap: spacing.sm },
    soort: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      minHeight: 56,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    soortActief: { borderColor: t.green700, backgroundColor: t.green50 },
    soortLabel: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: t.ink },
    soortUitleg: { fontSize: 13, fontFamily: fonts.regular, color: t.muted },
    label: { fontSize: 12.5, fontWeight: '600', fontFamily: fonts.semibold, color: t.muted },
    veld: {
      minHeight: 120,
      padding: 12,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
      color: t.ink,
      fontSize: 15,
      fontFamily: fonts.regular,
      textAlignVertical: 'top',
    },
    fotoRij: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    foto: { width: 120, height: 90, borderRadius: radius.md, backgroundColor: t.bgAlt },
    fotoWeg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bgAlt },
    fotoKies: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'flex-start',
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
    },
    fotoKiesTekst: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, color: t.ink },
    actie: { gap: 6, padding: spacing.md, borderRadius: radius.lg, backgroundColor: t.green50 },
    actieKop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    tekst: { fontSize: 14.5, lineHeight: 21, fontFamily: fonts.regular, color: t.ink },
    vet: { fontSize: 14.5, fontWeight: '700', fontFamily: fonts.bold, color: t.ink },
    link: { fontSize: 13, fontFamily: fonts.regular, color: t.muted, textDecorationLine: 'underline' },
    klein: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.regular, color: t.muted },
    fout: { padding: spacing.md, borderRadius: radius.md, backgroundColor: t.statusRejectBg },
    foutTekst: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.semibold, color: t.statusRejectFg },
  });
