/**
 * Meerwerk met Boss op de werkbon — BossMeerwerkVenster.jsx van het dashboard.
 *
 * De medewerker vertelt (typen of inspreken) wat er extra gedaan is. Boss
 * (edge function boss-meerwerk) maakt er een voorstel van: omschrijving voor de
 * klant, uren, materiaal en, voor wie bedragen mag zien, het bedrag met de
 * opbouw. Het voorstel is hier aan te passen; pas bij "Toevoegen" komt het op
 * de werkbon (het werkbonscherm doet het opslaan). Boss verzint niets: wat niet
 * in de notitie of de eigen gegevens staat, blijft leeg met een vraag erbij.
 *
 * Het bedrag rekent dit venster opnieuw uit als je uren, aantallen of prijzen
 * aanpast (zelfde rekenregel als de server, lib/boss/meerwerkRegels), tot je
 * het bedrag zelf invult.
 *
 * Inspreken: in de webapp de spraakherkenning van de browser; in de iOS- en
 * Android-app het dicteren van het toetsenbord (lib/spraak).
 */
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Mic, Square, X } from 'lucide-react-native';
import { FormSheet } from '@/components/FormSheet';
import { FormField } from '@/components/FormField';
import { DICTEER_HINT, useSpraak } from '@/lib/spraak';
import { formatEUR } from '@/lib/format';
import {
  berekenBedrag,
  leesVeld,
  naarVeld,
  naarVoorstel,
  voorstelOngeldig,
  type MeerwerkVoorstel,
} from '@/lib/boss/meerwerkRegels';
import { vraagBossMeerwerk } from '@/services/bossMeerwerkService';
import { getCompanySettings } from '@/services/settingsService';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';
import { tx } from '@/i18n';

export type BossMeerwerkInvoer = {
  omschrijving: string;
  uren: number | null;
  /** Alleen met bedragen; anders null. */
  bedrag: number | null;
  materialen: { naam: string; aantal: number; eenheid: string | null; materiaalId: string | null; prijs: number | null }[];
};

export function BossMeerwerk({
  werkbon,
  magBedragen,
  onSluit,
  onToevoegen,
}: {
  werkbon: { id: string; nummer?: string | null; titel?: string | null };
  magBedragen: boolean;
  onSluit: () => void;
  /** Zet het voorstel op de werkbon; geeft een foutmelding terug of null. */
  onToevoegen: (invoer: BossMeerwerkInvoer) => Promise<string | null>;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [notitie, setNotitie] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [voorstel, setVoorstel] = useState<(MeerwerkVoorstel & { gewijzigd?: boolean }) | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [uurtarief, setUurtarief] = useState<number | null>(null);
  const [bedragZelf, setBedragZelf] = useState(false);
  const spraak = useSpraak({ setTekst: setNotitie });
  const luistert = spraak.stand !== 'uit';

  useEffect(() => {
    if (!magBedragen) return undefined;
    let actief = true;
    void getCompanySettings().then((r) => {
      // Geen rij = geen uurtarief (de standaardwaarde is geen bron).
      if (actief && r.bestaat && !r.error && Number(r.data.uurtarief) > 0) setUurtarief(Number(r.data.uurtarief));
    });
    return () => {
      actief = false;
    };
  }, [magBedragen]);

  const vraag = async () => {
    const tekst = notitie.trim();
    if (!tekst || bezig) return;
    if (luistert) spraak.stop();
    setBezig(true);
    setFout(null);
    setMelding(null);
    try {
      const { resultaat, waarschuwingen } = await vraagBossMeerwerk(werkbon.id, tekst);
      if (resultaat?.soort !== 'voorstel') {
        setMelding(resultaat?.melding || tx('Boss kon hier geen meerwerk van maken.'));
        return;
      }
      setBedragZelf(false);
      setVoorstel(naarVoorstel(resultaat, waarschuwingen));
    } catch (e) {
      setFout((e as Error)?.message || tx('Boss is even niet bereikbaar. Probeer het zo nog eens.'));
    } finally {
      setBezig(false);
    }
  };

  // Opnieuw uitrekenen zolang de gebruiker het bedrag niet zelf invulde.
  const herberekend = useMemo(() => {
    if (!voorstel || !magBedragen || bedragZelf) return null;
    return berekenBedrag({
      uren: leesVeld(voorstel.uren),
      uurtarief,
      materialen: voorstel.materialen.map((m) => ({
        omschrijving: m.omschrijving,
        aantal: leesVeld(m.aantal),
        prijs_excl: leesVeld(m.prijs),
      })),
    });
  }, [voorstel, magBedragen, bedragZelf, uurtarief]);
  const volgtRegel = Boolean(voorstel?.gewijzigd && !bedragZelf && herberekend);
  const bedragVeld = volgtRegel ? naarVeld(herberekend!.bedrag) : (voorstel?.bedrag ?? '');
  const opbouw = volgtRegel ? herberekend!.opbouw || '' : voorstel?.opbouw || '';
  const bedragGetal = leesVeld(bedragVeld);

  const zet = <K extends keyof MeerwerkVoorstel>(k: K, v: MeerwerkVoorstel[K], wijzigtBedrag = false) =>
    setVoorstel((x) => (x ? { ...x, [k]: v, ...(wijzigtBedrag ? { gewijzigd: true } : {}) } : x));
  const zetMat = (sleutel: string, k: 'omschrijving' | 'aantal' | 'prijs', v: string) =>
    setVoorstel((x) =>
      x
        ? {
            ...x,
            gewijzigd: x.gewijzigd || k !== 'omschrijving',
            materialen: x.materialen.map((m) => (m.sleutel === sleutel ? { ...m, [k]: v } : m)),
          }
        : x,
    );
  const wegMat = (sleutel: string) =>
    setVoorstel((x) => (x ? { ...x, gewijzigd: true, materialen: x.materialen.filter((m) => m.sleutel !== sleutel) } : x));

  const ongeldig = voorstel ? voorstelOngeldig(voorstel, bedragVeld, magBedragen) : null;

  const toevoegen = async () => {
    if (!voorstel || ongeldig || opslaan) return;
    setOpslaan(true);
    setFout(null);
    const u = leesVeld(voorstel.uren);
    const e = await onToevoegen({
      omschrijving: voorstel.omschrijving.trim(),
      uren: u === null || Number.isNaN(u) ? null : u,
      bedrag: magBedragen && bedragGetal !== null && !Number.isNaN(bedragGetal) ? bedragGetal : null,
      materialen: voorstel.materialen.map((m) => {
        const prijs = leesVeld(m.prijs);
        return {
          naam: m.omschrijving.trim(),
          aantal: leesVeld(m.aantal) as number,
          eenheid: m.eenheid || null,
          materiaalId: m.materiaalId,
          prijs: magBedragen && prijs !== null && !Number.isNaN(prijs) ? prijs : null,
        };
      }),
    });
    setOpslaan(false);
    if (e) setFout(e);
  };

  const sluit = () => {
    if (bezig || opslaan) return;
    if (luistert) spraak.stop();
    onSluit();
  };

  const kop = werkbon.nummer || werkbon.titel || '';
  const stap = !voorstel ? tx('Stap 1 van 2: vertel wat je extra deed') : tx('Stap 2 van 2: controleer en zet het op de werkbon');

  return (
    <FormSheet
      visible
      title={tx('Meerwerk met Boss')}
      subtitle={kop ? `${stap} · ${kop}` : stap}
      error={fout}
      saving={bezig || opslaan}
      submitLabel={
        voorstel
          ? opslaan
            ? tx('Bezig…')
            : tx('Op de werkbon zetten')
          : bezig
            ? tx('Boss werkt eraan…')
            : tx('Laat Boss het uitwerken')
      }
      submitDisabled={voorstel ? Boolean(ongeldig) : !notitie.trim()}
      onSubmit={voorstel ? toevoegen : vraag}
      onClose={sluit}
    >
      {!voorstel ? (
        <>
          <View style={{ gap: spacing.xs }}>
            <Text style={s.label}>{tx('Vertel wat er extra gedaan is')}</Text>
            <View style={s.invoerRij}>
              <TextInput
                value={notitie}
                onChangeText={(v) => setNotitie(v.slice(0, 2000))}
                multiline
                editable={!bezig}
                autoFocus
                maxLength={2000}
                placeholder={
                  luistert
                    ? tx('Boss luistert…')
                    : tx('Bijvoorbeeld: kozijn achterdeur was rot, uitgefreesd en opgevuld met houtrot-vuller, 2 uur werk, 1 koker vuller gebruikt')
                }
                placeholderTextColor={t.muted2}
                accessibilityLabel={tx('Vertel wat er extra gedaan is')}
                testID="boss-meerwerk-notitie"
                style={s.notitie}
              />
              {spraak.ondersteund ? (
                <Pressable
                  onPress={() => (luistert ? spraak.stop() : spraak.start())}
                  disabled={bezig}
                  accessibilityRole="button"
                  accessibilityLabel={luistert ? tx('Stoppen met inspreken') : tx('Inspreken')}
                  accessibilityState={{ selected: luistert }}
                  style={({ pressed }) => [s.mic, luistert && s.micAan, pressed && { opacity: 0.8 }]}
                >
                  {luistert ? <Square size={16} color="#0D0D0D" /> : <Mic size={18} color={t.ink} />}
                </Pressable>
              ) : null}
            </View>
            <Text style={s.hint}>
              {tx('Noem wat je deed, waarom, hoe lang het duurde en welk materiaal je gebruikte. Boss verzint niets: wat je niet noemt, blijft leeg.')}
            </Text>
            {!spraak.ondersteund ? (
              <View style={s.hintRij}>
                <Mic size={14} color={t.green700} />
                <Text style={[s.hint, { flex: 1 }]}>
                  {tx(DICTEER_HINT)}
                  {Platform.OS === 'web' ? ` ${tx('Inspreken in de app zelf werkt in Chrome en Safari.')}` : ''}
                </Text>
              </View>
            ) : null}
            {luistert && spraak.tussen ? <Text style={[s.hint, { fontStyle: 'italic' }]}>{spraak.tussen}</Text> : null}
            {spraak.fout ? (
              <Pressable onPress={spraak.wisFout} accessibilityRole="alert">
                <Text style={[s.hint, { color: t.statusRejectFg }]}>{spraak.fout}</Text>
              </Pressable>
            ) : null}
          </View>
          {melding ? (
            <View style={s.vragen} accessibilityRole="alert">
              <Text style={s.vragenTekst}>
                <Text style={s.vragenKop}>{tx('Boss kon er nog geen meerwerk van maken.')}</Text> {melding}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Pressable
            onPress={() => {
              setVoorstel(null);
              setFout(null);
            }}
            disabled={opslaan}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Text style={s.link}>{tx('← Notitie aanpassen')}</Text>
          </Pressable>
          <FormField
            label={tx('Zo komt het op de werkbon (de klant ziet deze tekst)')}
            value={voorstel.omschrijving}
            onChangeText={(v) => zet('omschrijving', v)}
            multiline
            editable={!opslaan}
          />
          <FormField
            label={tx('Uren (optioneel)')}
            value={voorstel.uren}
            onChangeText={(v) => zet('uren', v, true)}
            keyboardType="decimal-pad"
            placeholder={tx('bijv. 2,5')}
            editable={!opslaan}
            hint={
              !magBedragen && voorstel.uren !== ''
                ? tx('Boek de echte uren daarna bij Uren, met "Hoort bij meerwerk".')
                : undefined
            }
          />
          {magBedragen ? (
            <FormField
              label={tx('Bedrag excl. btw')}
              value={bedragVeld}
              onChangeText={(v) => {
                setBedragZelf(true);
                zet('bedrag', v);
              }}
              keyboardType="decimal-pad"
              placeholder={tx('€ excl. btw')}
              editable={!opslaan}
            />
          ) : null}

          {voorstel.materialen.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={s.label}>{tx('Materiaal')}</Text>
              {voorstel.materialen.map((m) => {
                const aantalFout = !(Number(leesVeld(m.aantal)) > 0);
                return (
                  <View key={m.sleutel} style={s.matKaart}>
                    <View style={s.matRij}>
                      <TextInput
                        value={m.omschrijving}
                        onChangeText={(v) => zetMat(m.sleutel, 'omschrijving', v)}
                        accessibilityLabel={tx('Materiaal')}
                        editable={!opslaan}
                        style={[s.veld, { flex: 1 }]}
                      />
                      <Pressable
                        onPress={() => wegMat(m.sleutel)}
                        disabled={opslaan}
                        accessibilityRole="button"
                        accessibilityLabel={tx('{naam} weghalen', { naam: m.omschrijving })}
                        hitSlop={6}
                        style={s.weg}
                      >
                        <X size={16} color={t.muted} />
                      </Pressable>
                    </View>
                    <View style={s.matRij}>
                      <TextInput
                        value={m.aantal}
                        onChangeText={(v) => zetMat(m.sleutel, 'aantal', v)}
                        keyboardType="decimal-pad"
                        placeholder={tx('aantal')}
                        placeholderTextColor={t.muted2}
                        accessibilityLabel={tx('Aantal')}
                        editable={!opslaan}
                        style={[s.veld, s.klein, aantalFout && s.veldFout]}
                      />
                      <Text style={s.eenheid}>{m.eenheid}</Text>
                      {magBedragen ? (
                        <TextInput
                          value={m.prijs}
                          onChangeText={(v) => zetMat(m.sleutel, 'prijs', v)}
                          keyboardType="decimal-pad"
                          placeholder={tx('€ per stuk')}
                          placeholderTextColor={t.muted2}
                          accessibilityLabel={tx('Prijs per stuk excl. btw')}
                          editable={!opslaan}
                          style={[s.veld, s.prijs]}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })}
              <Text style={s.hint}>{tx('Komt op de werkbon, gekoppeld aan dit meerwerk.')}</Text>
            </View>
          ) : null}

          {magBedragen && opbouw ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={s.label}>{tx('Zo is het bedrag opgebouwd')}</Text>
              <Text style={s.opbouw}>{opbouw}</Text>
            </View>
          ) : null}
          {magBedragen && !opbouw && bedragGetal === null ? (
            <Text style={s.hint}>
              {tx('Geen bedrag: niet alles heeft een prijs of uurtarief. Vul het zelf in, of later bij het meerwerk.')}
            </Text>
          ) : null}

          {voorstel.vragen.length > 0 || voorstel.waarschuwingen.length > 0 ? (
            <View style={s.vragen} accessibilityRole="summary">
              {voorstel.waarschuwingen.length > 0 ? (
                <>
                  <View style={s.hintRij}>
                    <AlertTriangle size={15} color={t.statusWarnFg} />
                    <Text style={s.vragenKop}>{tx('Let op')}</Text>
                  </View>
                  {voorstel.waarschuwingen.map((v) => (
                    <Text key={v} style={s.vragenTekst}>
                      • {v}
                    </Text>
                  ))}
                </>
              ) : null}
              {voorstel.vragen.length > 0 ? (
                <>
                  <Text style={s.vragenKop}>{tx('Boss weet nog niet (vul het aan als je het weet):')}</Text>
                  {voorstel.vragen.map((v) => (
                    <Text key={v} style={s.vragenTekst}>
                      • {v}
                    </Text>
                  ))}
                </>
              ) : null}
              <Text style={[s.vragenTekst, { marginTop: 4 }]}>
                {tx('Je kunt het meerwerk gewoon op de werkbon zetten; dit houdt je niet tegen.')}
              </Text>
            </View>
          ) : null}

          {magBedragen && bedragGetal !== null && bedragGetal > 0 ? (
            <Text style={s.hint}>
              {tx('{bedrag} komt bij het meerwerk; niet op de werkbon die de klant tekent, wel op de factuur.', {
                bedrag: formatEUR(bedragGetal),
              })}
            </Text>
          ) : null}
          {ongeldig ? <Text style={[s.hint, { color: t.statusRejectFg }]}>{ongeldig}</Text> : null}
        </>
      )}
    </FormSheet>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    label: { fontSize: 12, fontWeight: '500', color: t.ink2 },
    hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    hintRij: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    link: { fontSize: 14, fontWeight: '600', color: t.green700 },
    invoerRij: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    notitie: {
      flex: 1,
      minHeight: 120,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: 12,
      padding: 12,
      fontSize: 15,
      lineHeight: 21,
      color: t.ink,
      backgroundColor: t.card,
      textAlignVertical: 'top',
    },
    mic: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
    },
    micAan: { backgroundColor: '#1DDB62' },
    matKaart: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: t.bgAlt },
    matRij: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    veld: {
      minHeight: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: 10,
      paddingHorizontal: 10,
      fontSize: 15,
      color: t.ink,
      backgroundColor: t.card,
    },
    veldFout: { borderColor: t.statusRejectFg, borderWidth: 1 },
    klein: { width: 80 },
    prijs: { flex: 1 },
    eenheid: { fontSize: 13, color: t.muted, minWidth: 32 },
    weg: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    opbouw: { fontSize: 13, lineHeight: 19, color: t.ink2 },
    vragen: {
      gap: 4,
      padding: 12,
      borderRadius: 12,
      backgroundColor: t.statusWarnBg,
    },
    vragenKop: { fontSize: 13, fontWeight: '700', color: t.statusWarnFg },
    vragenTekst: { fontSize: 13, lineHeight: 19, color: t.statusWarnFg },
  });
