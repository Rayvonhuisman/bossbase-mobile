import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';
import { createNote } from '@/services/noteService';
import { addProjectNote } from '@/services/projectService';
import { createActivity } from '@/services/activityService';
import { datumTekst, kiesKeuze, kopVan, meldBossOpgeslagen, waaromNiet, type BossKaart as Kaart } from '@/lib/boss/vastleggen';

/**
 * Een voorstel van Boss in de chat: notitie, taak of metingen. Boss legt zelf
 * niets vast; pas na Opslaan schrijft de app met de gewone services en de
 * sessie van de gebruiker. Metingen gaan naar Vertel het Boss op het project
 * (daar kijk je ze na en sla je ze op). Zelfde gedrag als het dashboard
 * (`BossKaart.jsx`).
 */
export function BossKaartje({
  kaart: k,
  onWijzig,
  onMetingen,
}: {
  kaart: Kaart;
  onWijzig: (k: Kaart) => void;
  onMetingen: (projectId: string, tekst: string) => void;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [concept, setConcept] = useState<{ tekst: string; datum: string; tijd: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const stand = k.stand ?? 'open';
  if (stand === 'weg') return null;

  const klaar = stand === 'opgeslagen' || stand === 'doorgezet';
  const nogKiezen = k.keuzes.length > 0 && !k.geweigerd;
  const melding = klaar ? null : waaromNiet(k);
  const kan = !waaromNiet(concept ? { ...k, tekst: concept.tekst } : k);

  const opslaan = async () => {
    const tekst = (concept?.tekst ?? k.tekst).trim();
    const datum = concept?.datum ?? k.datum;
    const tijd = concept?.tijd ?? k.tijd;
    if (!tekst) return setFout('Er staat nog niets in.');
    if (k.soort === 'metingen' && k.project) {
      onWijzig({ ...k, stand: 'doorgezet', tekst });
      onMetingen(k.project.id, tekst);
      return;
    }
    setBezig(true);
    setFout(null);
    const res =
      k.soort === 'notitie'
        ? k.project
          ? await addProjectNote(k.project.id, tekst)
          : await createNote({ customer_id: k.klant!.id, body: tekst })
        : await createActivity({
            title: tekst,
            type: k.taak_soort || 'task',
            customer_id: k.klant?.id ?? null,
            date: datum || null,
            time: tijd || null,
          });
    setBezig(false);
    if (!res.ok) return setFout(res.melding);
    setConcept(null);
    onWijzig({ ...k, stand: 'opgeslagen', tekst, datum, tijd });
    // Een open klant- of projectscherm laat het meteen zien.
    meldBossOpgeslagen({
      soort: k.soort,
      klant_id: k.klant?.id ?? null,
      project_id: k.soort === 'notitie' ? (k.project?.id ?? null) : null,
    });
  };

  return (
    <View style={[s.kaart, klaar && s.klaar]} testID="boss-kaart">
      <View style={s.kopRij}>
        {klaar ? <Check size={15} color={t.green700} /> : null}
        <Text style={s.kop} numberOfLines={2}>
          {kopVan(k)}
        </Text>
      </View>

      {nogKiezen ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={s.klein}>{waaromNiet(k)}</Text>
          <View style={s.knoppen}>
            {k.keuzes.map((x) => (
              <Pressable key={x.id} onPress={() => onWijzig(kiesKeuze(k, x.id))} style={s.keuze} accessibilityRole="button">
                <Text style={s.keuzeTekst}>
                  {x.naam}
                  {x.sub ? <Text style={s.klein}> · {x.sub}</Text> : null}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : melding && !concept ? (
        <Text style={[s.klein, { color: t.statusWarnFg, marginTop: 2 }]}>{melding}</Text>
      ) : null}

      {concept ? (
        <View style={{ gap: 6, marginTop: 6 }}>
          <TextInput
            value={concept.tekst}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, tekst: v } : c))}
            multiline
            style={[s.veld, { minHeight: 64 }]}
            accessibilityLabel="Tekst"
          />
          {k.soort === 'taak' ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput
                value={concept.datum}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, datum: v } : c))}
                placeholder="JJJJ-MM-DD"
                placeholderTextColor={t.muted2}
                style={[s.veld, { flex: 1 }]}
                accessibilityLabel="Datum"
              />
              <TextInput
                value={concept.tijd}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, tijd: v } : c))}
                placeholder="UU:MM"
                placeholderTextColor={t.muted2}
                style={[s.veld, { width: 90 }]}
                accessibilityLabel="Tijd"
              />
            </View>
          ) : null}
        </View>
      ) : (
        <>
          {k.soort === 'taak' && k.datum ? (
            <Text style={[s.klein, k.datum_onzeker && !klaar ? { color: t.statusWarnFg } : null]}>
              {datumTekst(k.datum)}
              {k.tijd ? ` om ${k.tijd}` : ''}
              {k.datum_onzeker && !klaar ? ' · controleer de datum' : ''}
            </Text>
          ) : null}
          {k.tekst ? <Text style={s.tekst}>{k.tekst}</Text> : null}
        </>
      )}

      {fout ? <Text style={[s.klein, { color: t.statusRejectFg, marginTop: 4 }]}>{fout}</Text> : null}

      <View style={[s.knoppen, { marginTop: 8 }]}>
        {klaar ? (
          <Text style={[s.klein, { color: t.green700 }]}>{stand === 'doorgezet' ? 'Geopend bij het project' : 'Opgeslagen'}</Text>
        ) : k.geweigerd ? (
          <Knop label="Sluiten" s={s} onPress={() => onWijzig({ ...k, stand: 'weg' })} />
        ) : (
          <>
            <Knop
              label={k.soort === 'metingen' ? 'Openen en nakijken' : bezig ? 'Opslaan…' : 'Opslaan'}
              hoofd
              s={s}
              uit={!kan || bezig}
              onPress={() => void opslaan()}
              testID="boss-kaart-opslaan"
            />
            {k.soort !== 'metingen' && !concept ? (
              <Knop label="Aanpassen" s={s} uit={bezig} onPress={() => setConcept({ tekst: k.tekst, datum: k.datum, tijd: k.tijd })} />
            ) : null}
            {concept ? (
              <Knop
                label="Klaar"
                s={s}
                uit={bezig}
                onPress={() => {
                  onWijzig({ ...k, tekst: concept.tekst, datum: concept.datum, tijd: concept.tijd, datum_onzeker: false });
                  setConcept(null);
                }}
              />
            ) : null}
            <Knop label="Annuleren" s={s} uit={bezig} onPress={() => onWijzig({ ...k, stand: 'weg' })} />
          </>
        )}
      </View>
    </View>
  );
}

function Knop({
  label,
  onPress,
  hoofd,
  uit,
  s,
  testID,
}: {
  label: string;
  onPress: () => void;
  hoofd?: boolean;
  uit?: boolean;
  s: ReturnType<typeof makeStyles>;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={uit}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [s.knop, hoofd && s.knopHoofd, uit && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[s.knopTekst, hoofd && { color: '#0D0D0D' }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    kaart: {
      alignSelf: 'stretch',
      marginLeft: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      backgroundColor: t.bg,
    },
    klaar: { borderColor: t.green100, backgroundColor: t.green50 },
    kopRij: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    kop: { flex: 1, fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: t.ink },
    tekst: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.regular, color: t.ink, marginTop: 4 },
    klein: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: t.muted },
    knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
    keuze: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: t.card },
    keuzeTekst: { fontSize: 14, fontFamily: fonts.semibold, color: t.ink },
    veld: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      color: t.ink,
      fontSize: 15,
      fontFamily: fonts.regular,
      backgroundColor: t.bg,
    },
    knop: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, backgroundColor: t.card, minHeight: 36, justifyContent: 'center' },
    knopHoofd: { backgroundColor: '#1DDB62' },
    knopTekst: { fontSize: 14, fontFamily: fonts.semibold, color: t.ink },
  });
