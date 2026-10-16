import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, ChevronDown, ChevronUp, Clock, RotateCcw, UserPlus, X } from 'lucide-react-native';
import { TimeField } from '@/components/DateField';
import { useTheme } from '@/providers';
import { listWerkbonnenInBereik, type PlanWerkbon, type Voertuig } from '@/services/planningService';
import {
  bezettingVanVoertuig,
  geplandeDatums,
  koppelingVanDag,
  korteDatum,
  magKoppelen,
  tijdVanDag,
  voertuigDubbel,
  voertuigenVanDag,
  voertuigTijd,
  voertuigWaarschuwingen,
  type Planning,
  type Tijdvak,
  type VoertuigCtx,
  type WerkbonDag,
} from '@/lib/werkbonLogica';
import { ds, spacing, type ThemeColors } from '@/theme';

/**
 * Voertuigen op een werkbon, per dag — WerkbonVoertuigenBlok van het
 * dashboard: voertuigen kiezen, en per voertuig een kaart met de dagen: rijdt
 * hij die dag mee, hoe laat (eigen tijd of de tijd van de dag), wie erin zit,
 * en wat er niet klopt (vol, iemand buiten de voertuigtijd, of het voertuig
 * staat al op een andere werkbon).
 *
 * Het model staat in lib/werkbonLogica (voertuigen, voertuigTijden, koppeling
 * in de `Planning`). De database toetst dezelfde regels bij het opslaan.
 */

const zetDag = <T,>(obj: Record<string, T> | undefined, datum: string, waarde: T | null): Record<string, T> => {
  const rest = { ...(obj ?? {}) };
  const leeg = waarde == null || (Array.isArray(waarde) ? waarde.length === 0 : Object.keys(waarde as object).length === 0);
  if (leeg) delete rest[datum];
  else rest[datum] = waarde as T;
  return rest;
};

export function VoertuigenPerDag({
  planning: p,
  onChange,
  alle,
  ids,
  onIds,
  ploeg,
  standaard,
  werkbonId,
  disabled = false,
}: {
  planning: Planning;
  onChange: (p: Planning) => void;
  /** Te kiezen voertuigen (actief, of al op de werkbon). */
  alle: Voertuig[];
  ids: string[];
  onIds: (ids: string[]) => void;
  ploeg: { id: string; naam: string }[];
  standaard: Partial<Tijdvak>;
  werkbonId: string | null;
  disabled?: boolean;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const datums = geplandeDatums(p);
  const ploegIds = ploeg.map((m) => m.id);
  const namen = useMemo(() => Object.fromEntries(ploeg.map((m) => [m.id, m.naam])), [ploeg]);
  const gekozen = ids.map((id) => alle.find((v) => v.id === id)).filter((v): v is Voertuig => !!v);

  const [openVoertuig, setOpenVoertuig] = useState<string | null>(null);
  const open = openVoertuig ?? gekozen[0]?.id ?? null;
  const [tijdOpen, setTijdOpen] = useState<{ datum: string; vid: string } | null>(null);
  const [kiesOpen, setKiesOpen] = useState<{ datum: string; vid: string } | null>(null);

  // Staat een voertuig op dat moment al op een andere werkbon? De werkbonnen
  // op de dagen van deze klus, één keer per bereik.
  const van = datums[0] ?? null;
  const tot = datums[datums.length - 1] ?? null;
  const [anderen, setAnderen] = useState<PlanWerkbon[]>([]);
  useEffect(() => {
    if (!van || !tot) return undefined;
    let actief = true;
    void listWerkbonnenInBereik(van, tot).then((r) => {
      if (actief) setAnderen(r.data);
    });
    return () => {
      actief = false;
    };
  }, [van, tot]);

  const ctx: VoertuigCtx = {
    p,
    standaard,
    ploegIds,
    voertuigen: gekozen,
    naamVan: (id) => namen[id] || 'Medewerker',
  };
  const anderenVoorDubbel = useMemo(
    () => anderen.map((w) => ({ ...w, werkbon_dagen: w.dagen as unknown as WerkbonDag[] })),
    [anderen],
  );

  const set = (patch: Partial<Planning>) => onChange({ ...p, ...patch });
  const dagPloeg = (d: string) => (Array.isArray(p.ploeg?.[d]) ? p.ploeg[d]! : ploegIds);

  // Rijdt mee of niet. Gaat hij eruit, dan ook zijn eigen tijd en wie erin zat.
  // Staan alle voertuigen weer aan, dan volgt de dag de werkbon.
  const wisselDagMee = (d: string, vid: string) => {
    const alleIds = gekozen.map((v) => v.id);
    const nu = voertuigenVanDag(ctx, d);
    const nieuw = nu.includes(vid) ? nu.filter((x) => x !== vid) : [...nu, vid];
    const patch: Partial<Planning> = {
      voertuigen:
        nieuw.length === alleIds.length && alleIds.every((x) => nieuw.includes(x))
          ? zetDag(p.voertuigen, d, null)
          : { ...(p.voertuigen ?? {}), [d]: nieuw },
    };
    if (!nieuw.includes(vid)) {
      const tijden = { ...(p.voertuigTijden?.[d] ?? {}) };
      delete tijden[vid];
      patch.voertuigTijden = zetDag(p.voertuigTijden, d, tijden);
      const koppeling = { ...(p.koppeling?.[d] ?? {}) };
      Object.keys(koppeling).forEach((pid) => {
        if (koppeling[pid] === vid) delete koppeling[pid];
      });
      patch.koppeling = zetDag(p.koppeling, d, koppeling);
      if (tijdOpen?.datum === d && tijdOpen.vid === vid) setTijdOpen(null);
      if (kiesOpen?.datum === d && kiesOpen.vid === vid) setKiesOpen(null);
    }
    set(patch);
  };

  const zetTijd = (d: string, vid: string, deel: Partial<Tijdvak>) =>
    set({
      voertuigTijden: {
        ...(p.voertuigTijden ?? {}),
        [d]: {
          ...(p.voertuigTijden?.[d] ?? {}),
          [vid]: { starttijd: null, eindtijd: null, ...(p.voertuigTijden?.[d]?.[vid] ?? {}), ...deel },
        },
      },
    });
  const wisTijd = (d: string, vid: string) => {
    const dag = { ...(p.voertuigTijden?.[d] ?? {}) };
    delete dag[vid];
    set({ voertuigTijden: zetDag(p.voertuigTijden, d, dag) });
  };
  const openTijd = (d: string, vid: string) => {
    if (!p.voertuigTijden?.[d]?.[vid]) zetTijd(d, vid, { ...tijdVanDag(p, d, standaard) });
    setKiesOpen(null);
    setTijdOpen({ datum: d, vid });
  };
  const koppel = (d: string, pid: string, vid: string | null) => {
    const dag = { ...(p.koppeling?.[d] ?? {}) };
    if (vid) dag[pid] = vid;
    else delete dag[pid];
    set({ koppeling: zetDag(p.koppeling, d, dag) });
  };

  return (
    <View style={styles.blok}>
      <Text style={styles.kop}>Voertuigen</Text>
      {alle.length === 0 ? (
        <Text style={styles.uitleg}>Nog geen voertuigen. Voeg ze toe bij Instellingen → Voertuigen.</Text>
      ) : (
        <>
          <Text style={styles.uitleg}>Meerdere mogelijk. Per voertuig kies je de dagen, de tijd en wie er meerijdt.</Text>
          <View style={styles.chipRij}>
            {alle.map((v) => {
              const aan = ids.includes(v.id);
              return (
                <Pressable
                  key={v.id}
                  disabled={disabled}
                  onPress={() => onIds(aan ? ids.filter((x) => x !== v.id) : [...ids, v.id])}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: aan, disabled }}
                  aria-checked={aan}
                  style={[styles.chip, aan && styles.chipAan]}
                >
                  <View style={[styles.dot, { backgroundColor: v.kleur || ds.green }]} />
                  <Text style={[styles.chipTekst, aan && { color: t.green700 }]}>
                    {v.naam}
                    {v.zitplaatsen ? ` · ${v.zitplaatsen} plek${v.zitplaatsen === 1 ? '' : 'ken'}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {gekozen.length > 0 && datums.length === 0 ? (
        <Text style={styles.uitleg}>Kies eerst de dagen hierboven; daarna plan je per dag een voertuig in.</Text>
      ) : null}

      {gekozen.map((v) => {
        const dagenMee = datums.filter((d) => voertuigenVanDag(ctx, d).includes(v.id));
        const uit = open !== v.id;
        const meldingen = datums.flatMap((d) => {
          if (!dagenMee.includes(d)) return [];
          const w = voertuigWaarschuwingen(ctx, d);
          const k = koppelingVanDag(ctx, d);
          const vt = voertuigTijd(ctx, d, v.id);
          const eigen = [
            ...(w.perVoertuig[v.id] ?? []),
            ...Object.entries(w.perPersoon)
              .filter(([pid]) => k[pid] === v.id)
              .flatMap(([, tekst]) => tekst),
            ...voertuigDubbel({
              werkbonnen: anderenVoorDubbel,
              werkbonId,
              datum: d,
              vid: v.id,
              starttijd: vt.starttijd,
              eindtijd: vt.eindtijd,
            }).map((c) => `Staat ook op ${c.titel} (${c.starttijd}–${c.eindtijd}).`),
          ];
          return eigen.map((tekst) => `${korteDatum(d)}: ${tekst}`);
        });

        return (
          <View key={v.id} style={[styles.kaart, meldingen.length > 0 && { borderColor: t.statusWarnFg }]}>
            <Pressable
              onPress={() => setOpenVoertuig(uit ? v.id : '__dicht__')}
              accessibilityRole="button"
              accessibilityState={{ expanded: !uit }}
              aria-expanded={!uit}
              style={styles.kaartKop}
            >
              <View style={[styles.dot, { backgroundColor: v.kleur || ds.green }]} />
              <Text style={styles.kaartNaam} numberOfLines={1}>
                {v.naam}
              </Text>
              <Text style={styles.kaartMeta} numberOfLines={1}>
                {[
                  v.zitplaatsen ? `${v.zitplaatsen} ${v.zitplaatsen === 1 ? 'plek' : 'plekken'}` : null,
                  datums.length === 0
                    ? null
                    : dagenMee.length === datums.length
                      ? 'alle dagen'
                      : `${dagenMee.length} van ${datums.length} dagen`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {meldingen.length > 0 ? <AlertTriangle size={15} color={t.statusWarnFg} strokeWidth={2.4} /> : null}
              {uit ? <ChevronDown size={18} color={t.muted} /> : <ChevronUp size={18} color={t.muted} />}
            </Pressable>

            {!uit
              ? datums.map((d) => {
                  const aan = dagenMee.includes(d);
                  const dagTijd = tijdVanDag(p, d, standaard);
                  const vt = voertuigTijd(ctx, d, v.id);
                  const eigenTijd =
                    aan && !!p.voertuigTijden?.[d]?.[v.id] && (vt.starttijd !== dagTijd.starttijd || vt.eindtijd !== dagTijd.eindtijd);
                  const koppeling = koppelingVanDag(ctx, d);
                  const inzittenden = ploeg.filter((m) => koppeling[m.id] === v.id);
                  const bezet = aan ? bezettingVanVoertuig(ctx, d, v.id) : 0;
                  const vol = !!v.zitplaatsen && bezet >= v.zitplaatsen;
                  const kiesHier = kiesOpen?.datum === d && kiesOpen.vid === v.id;
                  const tijdHier = tijdOpen?.datum === d && tijdOpen.vid === v.id;
                  const kandidaten = ploeg.filter((m) => dagPloeg(d).includes(m.id));
                  return (
                    <View key={d} style={styles.dag}>
                      <View style={styles.dagRij}>
                        <Pressable
                          disabled={disabled}
                          onPress={() => wisselDagMee(d, v.id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: aan, disabled }}
                          aria-checked={aan}
                          accessibilityLabel={`${v.naam} rijdt mee op ${korteDatum(d)}`}
                          style={[styles.chip, aan ? styles.chipAan : styles.chipUit]}
                        >
                          <Text style={[styles.chipTekst, aan && { color: t.green700 }]}>{korteDatum(d)}</Text>
                        </Pressable>
                        {aan ? (
                          <>
                            <Text style={styles.tijd}>
                              {vt.starttijd || '?'}–{vt.eindtijd || '?'}
                            </Text>
                            <Text style={[styles.bezetting, vol && { color: t.statusWarnFg }]}>
                              {v.zitplaatsen ? `${bezet}/${v.zitplaatsen}` : `${bezet}`}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.uitleg}>rijdt niet mee</Text>
                        )}
                      </View>

                      {aan ? (
                        <View style={styles.chipRij}>
                          {inzittenden.map((m) => (
                            <Pressable
                              key={m.id}
                              disabled={disabled}
                              onPress={() => koppel(d, m.id, null)}
                              accessibilityRole="button"
                              accessibilityLabel={`${m.naam} uit ${v.naam}`}
                              style={[styles.chip, styles.chipAan]}
                            >
                              <Text style={[styles.chipTekst, { color: t.green700 }]}>{m.naam}</Text>
                              <X size={14} color={t.green700} />
                            </Pressable>
                          ))}
                          <Pressable
                            disabled={disabled}
                            onPress={() => {
                              setTijdOpen(null);
                              setKiesOpen(kiesHier ? null : { datum: d, vid: v.id });
                            }}
                            accessibilityRole="button"
                            style={styles.link}
                          >
                            <UserPlus size={14} color={ds.green700} />
                            <Text style={styles.linkTekst}>Wie rijdt mee</Text>
                          </Pressable>
                          <Pressable
                            disabled={disabled}
                            onPress={() => (eigenTijd ? wisTijd(d, v.id) : openTijd(d, v.id))}
                            accessibilityRole="button"
                            style={styles.link}
                          >
                            {eigenTijd ? <RotateCcw size={14} color={ds.green700} /> : <Clock size={14} color={ds.green700} />}
                            <Text style={styles.linkTekst}>{eigenTijd ? 'Tijd van de dag' : 'Eigen tijd'}</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      {tijdHier ? (
                        <View style={styles.sub}>
                          <Text style={styles.subKop}>
                            Eigen tijd voor {v.naam} · {korteDatum(d)}
                          </Text>
                          <View style={styles.tijdRij}>
                            <View style={{ flex: 1 }}>
                              <TimeField
                                label="Begin"
                                value={p.voertuigTijden?.[d]?.[v.id]?.starttijd || null}
                                onChange={(w) => zetTijd(d, v.id, { starttijd: w })}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <TimeField
                                label="Eind"
                                value={p.voertuigTijden?.[d]?.[v.id]?.eindtijd || null}
                                onChange={(w) => zetTijd(d, v.id, { eindtijd: w })}
                              />
                            </View>
                          </View>
                          <View style={styles.subKnoppen}>
                            <Pressable
                              onPress={() => {
                                wisTijd(d, v.id);
                                setTijdOpen(null);
                              }}
                              accessibilityRole="button"
                              style={styles.link}
                            >
                              <Text style={styles.linkTekst}>Zelfde tijd als de dag</Text>
                            </Pressable>
                            <Pressable onPress={() => setTijdOpen(null)} accessibilityRole="button" style={styles.link}>
                              <Text style={styles.linkTekst}>Klaar</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}

                      {kiesHier ? (
                        <View style={styles.sub}>
                          <Text style={styles.subKop}>Wie rijdt mee · {korteDatum(d)}</Text>
                          {kandidaten.length === 0 ? <Text style={styles.uitleg}>Niemand werkt op deze dag.</Text> : null}
                          {kandidaten.map((m) => {
                            const zitHier = koppeling[m.id] === v.id;
                            const andere = koppeling[m.id] && !zitHier ? gekozen.find((x) => x.id === koppeling[m.id]) : null;
                            const reden = zitHier ? '' : magKoppelen(ctx, d, m.id, v.id);
                            return (
                              <Pressable
                                key={m.id}
                                disabled={disabled || (!zitHier && !!reden)}
                                onPress={() => koppel(d, m.id, zitHier ? null : v.id)}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: zitHier, disabled: disabled || (!zitHier && !!reden) }}
                                aria-checked={zitHier}
                                style={[styles.kandidaat, zitHier && styles.chipAan, !zitHier && !!reden && { opacity: 0.6 }]}
                              >
                                <Text style={[styles.chipTekst, zitHier && { color: t.green700 }]}>{m.naam}</Text>
                                {zitHier ? (
                                  <Text style={styles.uitleg}>rijdt mee — tik om eruit te halen</Text>
                                ) : reden ? (
                                  <Text style={[styles.uitleg, { color: t.statusWarnFg }]}>{reden}</Text>
                                ) : andere ? (
                                  <Text style={styles.uitleg}>zit nu in {andere.naam}</Text>
                                ) : null}
                              </Pressable>
                            );
                          })}
                          <View style={styles.subKnoppen}>
                            <View />
                            <Pressable onPress={() => setKiesOpen(null)} accessibilityRole="button" style={styles.link}>
                              <Text style={styles.linkTekst}>Klaar</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              : null}

            {!uit && meldingen.length > 0 ? (
              <View style={styles.meldingen} accessibilityRole="alert">
                {meldingen.map((tekst) => (
                  <View key={tekst} style={styles.melding}>
                    <AlertTriangle size={13} color={t.statusWarnFg} strokeWidth={2.4} />
                    <Text style={styles.meldingTekst}>{tekst}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {gekozen.length === 0 && alle.length > 0 ? (
        <Text style={styles.uitleg}>Nog geen voertuig gekozen voor deze klus.</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    blok: { gap: spacing.sm },
    kop: { fontSize: 14, fontWeight: '700', color: t.ink },
    uitleg: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    chipAan: { backgroundColor: t.green50, borderColor: ds.green },
    chipUit: { opacity: 0.7 },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    kaart: {
      backgroundColor: t.card,
      borderRadius: t.rMd,
      borderWidth: 1,
      borderColor: t.line,
      padding: spacing.md,
      gap: spacing.sm,
    },
    kaartKop: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    kaartNaam: { fontSize: 14, fontWeight: '700', color: t.ink, flexShrink: 1 },
    kaartMeta: { flex: 1, fontSize: 12.5, color: t.muted },
    dag: { gap: 8, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    dagRij: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    tijd: { fontSize: 13, fontWeight: '700', color: t.ink, fontVariant: ['tabular-nums'] },
    bezetting: { fontSize: 12.5, fontWeight: '700', color: t.muted },
    link: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 4 },
    linkTekst: { fontSize: 13, fontWeight: '700', color: ds.green700 },
    sub: { gap: 8, padding: spacing.sm, borderRadius: t.rMd, backgroundColor: t.bgAlt },
    subKop: { fontSize: 13, fontWeight: '700', color: t.ink },
    subKnoppen: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    tijdRij: { flexDirection: 'row', gap: spacing.md },
    kandidaat: {
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
      justifyContent: 'center',
      gap: 2,
    },
    meldingen: { gap: 6, paddingTop: spacing.sm },
    melding: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
    meldingTekst: { flex: 1, fontSize: 12.5, lineHeight: 18, color: t.statusWarnFg },
  });
