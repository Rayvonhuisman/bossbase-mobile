import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Mic, Pencil } from 'lucide-react-native';
import { FormSheet } from '@/components/FormSheet';
import { Dialog } from '@/lib/dialog';
import { openDashboard } from '@/lib/dashboardLink';
import { bevestigVerwijderen } from '@/lib/useSave';
import { usePermissions, useTheme, useToast } from '@/providers';
import { ds, radius, spacing, type ThemeColors } from '@/theme';
import {
  brancheVelden,
  extraRegels,
  formUitMeting,
  nieuwForm,
  toonMaat,
  toonWaarde,
  totalen,
  type BrancheVeld,
  type Meting,
  type MetingForm,
} from '@/lib/metingen';
import {
  createMeting,
  deleteMeting,
  getBranche,
  listMetingen,
  magMetingenBeheren,
  updateMeting,
} from '@/services/metingService';
import { Blok, KleineKnop } from './bouwstenen';
import { MetingVelden } from './MetingVelden';
import { VertelHetBoss } from './VertelHetBoss';

/**
 * Metingen op de projectkaart, zoals het blok in het dashboard
 * (MetingenBlok.jsx): de lijst met maten en de berekening, zelf toevoegen,
 * wijzigen en verwijderen, en "Vertel het Boss" (inspreken of typen).
 *
 * Wie mag wijzigen bepaalt de database (`bb_mag_metingen_beheren`): admin,
 * projecten_bewerken, planning, de gedeelde werkruimte, wie aan het project of
 * een werkbon ervan is toegewezen. Anderen zien de lijst alleen. Zelf invullen
 * zit in elk pakket; Vertel het Boss alleen in Groei en Team
 * (`metingen_uitlezen`): in Starter staat de knop er wel, en zegt hij dat.
 *
 * Geen prijzen: een meting heeft geen bedrag, en de koppeling met Materialen
 * (waar wel een prijs aan hangt) toont de app niet.
 *
 * Niet in de app (wel in het dashboard): foto's bij een meting en "Metingen uit
 * document". Bestaande foto's blijven staan; het aantal staat erbij.
 */
export function MetingenBlok({ projectId }: { projectId: string }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const { toon } = useToast();
  const { hasFeature, loaded } = usePermissions();
  const [metingen, setMetingen] = useState<Meting[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [mag, setMag] = useState(false);
  const [branche, setBranche] = useState('');
  const [form, setForm] = useState<MetingForm | null>(null);
  const [formBezig, setFormBezig] = useState(false);
  const [formFout, setFormFout] = useState<string | null>(null);
  const [vertel, setVertel] = useState(false);
  const velden = useMemo(() => brancheVelden(branche) as BrancheVeld[], [branche]);

  const laad = useCallback(async () => {
    try {
      setMetingen(await listMetingen(projectId));
      setFout(null);
    } catch (e) {
      if (__DEV__) console.warn('[metingen] laden mislukt', e);
      setFout('De metingen konden niet worden geladen.');
    } finally {
      setLaden(false);
    }
  }, [projectId]);

  useEffect(() => {
    let actief = true;
    listMetingen(projectId)
      .then((l) => actief && (setMetingen(l), setFout(null)))
      .catch((e) => {
        if (__DEV__) console.warn('[metingen] laden mislukt', e);
        if (actief) setFout('De metingen konden niet worden geladen.');
      })
      .finally(() => actief && setLaden(false));
    magMetingenBeheren(projectId).then((m) => actief && setMag(m));
    getBranche()
      .then((b) => actief && setBranche(b))
      .catch(() => {});
    return () => {
      actief = false;
    };
  }, [projectId]);

  // ── Toevoegen en wijzigen ────────────────────────────────────────────────
  const nieuw = () => {
    setFormFout(null);
    setForm(nieuwForm(metingen[metingen.length - 1]));
  };

  const bewaar = async () => {
    if (!form) return;
    if (!form.naam.trim()) {
      setFormFout('Geef de meting een naam, bijvoorbeeld "Raam woonkamer links".');
      return;
    }
    setFormBezig(true);
    setFormFout(null);
    const res = form.id
      ? await updateMeting(form.id, form)
      : await createMeting(projectId, form, { volgorde: metingen.length });
    setFormBezig(false);
    if (!res.ok) {
      setFormFout(res.melding);
      return;
    }
    if (form.id) setMetingen((l) => l.map((x) => (x.id === res.data.id ? res.data : x)));
    else setMetingen((l) => [...l, res.data]);
    toon(form.id ? 'Meting opgeslagen' : 'Meting toegevoegd', 'succes');
    setForm(null);
  };

  const verwijder = (m: Meting) => {
    bevestigVerwijderen(`Meting "${m.naam}"`, async () => {
      const res = await deleteMeting(m);
      if (!res.ok) {
        toon(res.melding, 'fout');
        return;
      }
      setMetingen((l) => l.filter((x) => x.id !== m.id));
      setForm(null);
      toon('Meting verwijderd', 'succes');
    });
  };

  const openVertel = () => {
    if (!hasFeature('metingen_uitlezen')) {
      Dialog.alert(
        'Vertel het Boss',
        'Metingen aan Boss vertellen (inspreken of typen) zit in Groei en Team. Metingen zelf invullen kan in elk pakket. Je abonnement wijzig je op het dashboard.',
        [
          { text: 'Sluiten', style: 'cancel' },
          { text: 'Naar het dashboard', onPress: () => void openDashboard('abonnement') },
        ],
      );
      return;
    }
    setVertel(true);
  };

  const kop = totalen(metingen);
  const kanWijzigen = mag && loaded;

  return (
    <>
      <Blok titel="Metingen" actie={kanWijzigen ? <KleineKnop label="Meting" icon="plus" onPress={nieuw} /> : undefined}>
        <View style={s.inhoud}>
          {kop ? <Text style={s.kop}>{kop}</Text> : null}

          {kanWijzigen ? (
            <Pressable
              onPress={openVertel}
              accessibilityRole="button"
              accessibilityLabel="Vertel het Boss: metingen inspreken of typen"
              testID="metingen-vertel-boss"
              style={({ pressed }) => [s.vertel, pressed && { opacity: 0.85 }]}
            >
              <View style={s.vertelIcoon}>
                <Mic size={20} color={ds.greenInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.vertelTitel}>Vertel het Boss</Text>
                <Text style={s.vertelSub}>Spreek in wat je meet, Boss maakt er metingen van</Text>
              </View>
            </Pressable>
          ) : null}

          {laden ? (
            <Text style={s.klein}>Laden…</Text>
          ) : fout ? (
            <View style={{ gap: 8, alignItems: 'flex-start' }}>
              <Text style={s.klein}>{fout}</Text>
              <KleineKnop
                label="Opnieuw proberen"
                onPress={() => {
                  setLaden(true);
                  laad();
                }}
              />
            </View>
          ) : metingen.length === 0 ? (
            <Text style={s.klein}>
              {kanWijzigen ? 'Nog geen metingen. Vertel ze aan Boss of voeg ze zelf toe.' : 'Nog geen metingen bij dit project.'}
            </Text>
          ) : (
            <View>
              {metingen.map((m, i) => {
                const extra = extraRegels(m.extra, branche) as { key: string; waarde: string }[];
                const sub = [
                  m.aantal !== 1 ? `${m.aantal.toLocaleString('nl-NL')}×` : null,
                  toonMaat(m),
                  extra.map((e) => e.waarde).join(', ') || null,
                  m.werkbonId ? 'nagemeten op werkbon' : null,
                  m.fotos.length ? (m.fotos.length === 1 ? '1 foto' : `${m.fotos.length} foto's`) : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={m.id}
                    onPress={
                      kanWijzigen
                        ? () => {
                            setFormFout(null);
                            setForm(formUitMeting(m));
                          }
                        : undefined
                    }
                    disabled={!kanWijzigen}
                    accessibilityRole={kanWijzigen ? 'button' : undefined}
                    accessibilityLabel={kanWijzigen ? `${m.naam} wijzigen` : undefined}
                    style={({ pressed }) => [s.rij, i === 0 && s.eerste, pressed && kanWijzigen && { opacity: 0.7 }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.naam}>{m.naam}</Text>
                      {sub ? <Text style={s.sub}>{sub}</Text> : null}
                      {m.opmerking ? <Text style={s.opmerking}>{m.opmerking}</Text> : null}
                    </View>
                    <Text style={[s.waarde, m.waarde == null && { color: t.statusWarnFg }]}>
                      {m.waarde == null ? 'maat ontbreekt' : toonWaarde(m.waarde, m.waardeEenheid)}
                    </Text>
                    {kanWijzigen ? <Pencil size={14} color={t.muted2} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </Blok>

      <FormSheet
        visible={form !== null}
        title={form?.id ? 'Meting wijzigen' : 'Meting toevoegen'}
        error={formFout}
        saving={formBezig}
        submitLabel={formBezig ? 'Opslaan…' : 'Opslaan'}
        submitDisabled={!form?.naam.trim()}
        onSubmit={bewaar}
        onClose={() => setForm(null)}
        destructive={
          form?.id
            ? {
                label: 'Verwijderen',
                onPress: () => {
                  const m = metingen.find((x) => x.id === form.id);
                  if (m) verwijder(m);
                },
              }
            : undefined
        }
      >
        {form ? (
          <MetingVelden
            m={form}
            set={(k, v) => setForm((f) => (f ? { ...f, [k]: v } : f))}
            velden={velden}
            disabled={formBezig}
          />
        ) : null}
      </FormSheet>

      {vertel ? (
        <VertelHetBoss
          open={vertel}
          projectId={projectId}
          velden={velden}
          volgordeVanaf={metingen.length}
          onSluit={() => setVertel(false)}
          onOpgeslagen={(nieuw) => {
            setMetingen((l) => [...l, ...nieuw]);
            toon(nieuw.length === 1 ? '1 meting opgeslagen' : `${nieuw.length} metingen opgeslagen`, 'succes');
          }}
        />
      ) : null}
    </>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    inhoud: { gap: spacing.md },
    kop: { fontSize: 13, color: t.muted, marginTop: -4 },
    klein: { fontSize: 13, color: t.muted, lineHeight: 18 },
    vertel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: radius.lg,
      backgroundColor: t.bgAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      minHeight: 64,
    },
    vertelIcoon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: ds.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vertelTitel: { fontSize: 15, fontWeight: '700', color: t.ink },
    vertelSub: { fontSize: 12.5, color: t.muted, marginTop: 1 },
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
      minHeight: 48,
    },
    eerste: { borderTopWidth: 0, paddingTop: 0 },
    naam: { fontSize: 14.5, fontWeight: '600', color: t.ink },
    sub: { fontSize: 12.5, color: t.muted, marginTop: 1 },
    opmerking: { fontSize: 12.5, color: t.ink2, marginTop: 2 },
    waarde: { fontSize: 14, fontWeight: '700', color: t.ink, textAlign: 'right' },
  });
