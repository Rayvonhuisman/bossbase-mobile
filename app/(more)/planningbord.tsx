import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Lock,
} from 'lucide-react-native';
import {
  AppCard,
  AppScreen,
  AppTopBar,
  ErrorState,
  LoadingScreen,
  NoticeBanner,
  PermissionGate,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  listAlleVoertuigen,
  listNietIngeplandeKandidaten,
  listWerkbonnenInBereik,
  type PlanWerkbon,
  type Voertuig,
} from '@/services/planningService';
import { listCompanyProfiles } from '@/services/workOrderService';
import {
  dubbeleBlokken,
  medewerkerKleur,
  nietIngepland,
  roosterBlokken,
  type RoosterBlok,
} from '@/lib/planningRegels';
import { dagenVanWeek, isoWeek, maandagVan, plusDagen } from '@/lib/urenRegels';
import { todayISO } from '@/lib/format';
import { useLaden } from '@/lib/useLaden';
import { useSchermklasse } from '@/lib/schermklasse';
import { terugOfNaar } from '@/lib/navigatie';
import { ds, dsShadow, type ThemeColors } from '@/theme';

/**
 * Planning — de planningpagina van het dashboard (`PlanningPage.jsx`), om te
 * bekijken: wie werkt wanneer waar, welke bus rijdt, en wat nog niet is
 * ingepland.
 *
 * Toegang: recht `planning` + feature `planning` (pakket Team of module bij
 * Groei), zoals de NAV-gate van het dashboard. Voertuigweergave alleen met de
 * module `voertuigen`.
 *
 * - Dag of week (ma t/m zo); vorige / Vandaag / volgende.
 * - Medewerkers: één blok per persoon in de dagploeg, met diens eigen tijd.
 *   Een dag zonder ploeg staat onder "Niet toegewezen".
 * - Voertuigen: één blok per bus met de voertuigtijd en de inzittenden.
 * - Dubbel ingepland krijgt een oranje driehoek (waarschuwing, geen blokkade).
 * - Tik op een blok of een niet-ingeplande werkbon → de werkbon.
 *
 * Op een iPad (tabletbreedte) een breed rooster: resources als rijen, dagen als
 * kolommen. Op een telefoon per medewerker/dag.
 *
 * Slepen, rekken en inplannen (met meldingen, `planning_wijzigingen` en de
 * agenda-synchronisatie) blijven in het dashboard.
 */
export default function PlanningbordRoute() {
  return (
    <PermissionGate permission="planning" feature="planning" label="Planning">
      <PlanningbordScreen />
    </PermissionGate>
  );
}

type Zicht = 'dag' | 'week';
type Modus = 'medewerker' | 'voertuig';

type Resource = { id: string | null; naam: string; kleur: string; sub?: string };

const DAG_LANG = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const datum = (iso: string) => new Date(`${iso}T12:00:00`);

function periodeLabel(zicht: Zicht, anker: string, dagen: string[]): string {
  if (zicht === 'dag') return DAG_LANG.format(datum(anker));
  const a = datum(dagen[0]!);
  const b = datum(dagen[6]!);
  const links = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MAAND_KORT[a.getMonth()]}`;
  return `${links}–${b.getDate()} ${MAAND_KORT[b.getMonth()]} ${b.getFullYear()} · wk ${isoWeek(dagen[0]!)}`;
}

function dagKort(iso: string): string {
  const d = datum(iso);
  return `${DAG_KORT[d.getDay()]} ${d.getDate()}`;
}

function PlanningbordScreen() {
  const router = useRouter();
  const { hasFeature } = usePermissions();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { klasse } = useSchermklasse();
  const breed = klasse === 'tablet';
  const metVoertuigen = hasFeature('voertuigen');

  const { zicht: zichtParam } = useLocalSearchParams<{ zicht?: string }>();
  const [zicht, setZicht] = useState<Zicht>(zichtParam === 'dag' ? 'dag' : 'week');
  const [modus, setModus] = useState<Modus>('medewerker');
  const vandaag = todayISO();
  const [anker, setAnker] = useState(vandaag);
  const weekDatums = useMemo(() => dagenVanWeek(maandagVan(anker)), [anker]);
  const dagen = zicht === 'dag' ? [anker] : weekDatums;
  const van = dagen[0]!;
  const tot = dagen[dagen.length - 1]!;

  const [werkbonnen, setWerkbonnen] = useState<PlanWerkbon[]>([]);
  const [los, setLos] = useState<PlanWerkbon[]>([]);
  const [team, setTeam] = useState<{ id: string; naam: string }[]>([]);
  const [voertuigen, setVoertuigen] = useState<Voertuig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deelFout, setDeelFout] = useState<string | null>(null);
  const [losOpen, setLosOpen] = useState(true);
  const [gekozen, setGekozen] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    setError(null);
    const [wb, nl, tm, vt] = await Promise.all([
      listWerkbonnenInBereik(van, tot),
      listNietIngeplandeKandidaten(),
      listCompanyProfiles(),
      metVoertuigen ? listAlleVoertuigen() : Promise.resolve({ data: [] as Voertuig[], error: null }),
    ]);
    if (wb.error) {
      setError(wb.error);
      return;
    }
    setWerkbonnen(wb.data);
    setLos(nietIngepland(nl.data));
    setTeam(tm.data.map((p) => ({ id: p.id, naam: p.full_name ?? 'Medewerker' })));
    setVoertuigen(vt.data);
    setDeelFout(
      nl.error
        ? 'De niet-ingeplande werkbonnen konden niet worden geladen.'
        : tm.error || vt.error
          ? 'Niet alle namen konden worden geladen.'
          : null,
    );
  }, [van, tot, metVoertuigen]);

  const { loading, refreshing, onRefresh, opnieuw } = useLaden(load, { onFout: setError });

  const actieveModus: Modus = metVoertuigen ? modus : 'medewerker';
  const blokken = useMemo(
    () => roosterBlokken(werkbonnen, { van, tot, modus: actieveModus }),
    [werkbonnen, van, tot, actieveModus],
  );
  const dubbel = useMemo(() => dubbeleBlokken(blokken), [blokken]);

  const naamVan = useMemo(() => new Map(team.map((m) => [m.id, m.naam])), [team]);
  const voertuigVan = useMemo(() => new Map(voertuigen.map((v) => [v.id, v])), [voertuigen]);

  /** Rijen van het rooster: het team (of de actieve bussen), plus wie er verder in voorkomt. */
  const resources: Resource[] = useMemo(() => {
    const inBlokken = new Set(blokken.map((b) => b.resource));
    if (actieveModus === 'voertuig') {
      const lijst = voertuigen.filter((v) => v.actief || inBlokken.has(v.id));
      const rijen: Resource[] = lijst.map((v) => ({
        id: v.id,
        naam: v.naam,
        kleur: v.kleur || ds.green,
        sub: [v.kenteken, v.zitplaatsen ? `${v.zitplaatsen} plekken` : null].filter(Boolean).join(' · ') || undefined,
      }));
      for (const id of inBlokken) {
        if (id && !voertuigVan.has(id)) rijen.push({ id, naam: 'Voertuig', kleur: '#9ca3af' });
      }
      return rijen;
    }
    const rijen: Resource[] = team.map((m, i) => ({ id: m.id, naam: m.naam, kleur: medewerkerKleur(i) }));
    for (const id of inBlokken) {
      if (id && !naamVan.has(id)) rijen.push({ id, naam: 'Oud-medewerker', kleur: '#9ca3af' });
    }
    if (inBlokken.has(null)) rijen.push({ id: null, naam: 'Niet toegewezen', kleur: medewerkerKleur(-1) });
    return rijen;
  }, [actieveModus, blokken, team, voertuigen, naamVan, voertuigVan]);

  const blokkenVan = useCallback(
    (resource: string | null, dag: string) =>
      blokken.filter((b) => b.resource === resource && b.datum === dag),
    [blokken],
  );

  const stap = (richting: -1 | 1) => setAnker((a) => plusDagen(a, richting * (zicht === 'dag' ? 1 : 7)));
  const openWerkbon = (id: string) => router.push(`/work-orders/${id}`);

  const blokTekst = (b: RoosterBlok<PlanWerkbon>) => {
    const w = b.werkbon;
    const wie =
      actieveModus === 'voertuig'
        ? b.inzittenden.map((p) => naamVan.get(p) ?? 'Medewerker').join(', ')
        : b.voertuigId
          ? (voertuigVan.get(b.voertuigId)?.naam ?? null)
          : null;
    const bezet =
      actieveModus === 'voertuig' && b.resource && voertuigVan.get(b.resource)?.zitplaatsen
        ? `${b.inzittenden.length}/${voertuigVan.get(b.resource)!.zitplaatsen}`
        : null;
    return {
      titel: w.titel || w.nummer || 'Werkbon',
      tijd: `${b.starttijd}${b.eindtijd ? `–${b.eindtijd}` : ''}${b.dagenTotaal > 1 ? ` · dag ${b.dagNr}/${b.dagenTotaal}` : ''}`,
      meta: [w.customer?.name, wie, bezet].filter(Boolean).join(' · '),
    };
  };

  const blok = (b: RoosterBlok<PlanWerkbon>, kleur: string, compact?: boolean) => {
    const tekst = blokTekst(b);
    const isDubbel = dubbel.has(b.sleutel);
    const opSlot = !!b.werkbon.ondertekend_op;
    return (
      <Pressable
        key={b.sleutel}
        onPress={() => openWerkbon(b.werkbon.id)}
        accessibilityRole="button"
        accessibilityLabel={`${tekst.titel}, ${tekst.tijd}${isDubbel ? ', dubbel ingepland' : ''}`}
        style={({ pressed }) => [styles.blok, compact && styles.blokCompact, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.blokStreep, { backgroundColor: kleur }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.blokKop}>
            <Text style={styles.blokTijd} numberOfLines={1}>
              {tekst.tijd}
            </Text>
            {isDubbel ? <AlertTriangle size={13} color={t.statusWarnFg} strokeWidth={2.4} /> : null}
            {opSlot ? <Lock size={12} color={t.muted} strokeWidth={2.2} /> : null}
          </View>
          <Text style={styles.blokTitel} numberOfLines={compact ? 2 : 1}>
            {tekst.titel}
          </Text>
          {tekst.meta ? (
            <Text style={styles.blokMeta} numberOfLines={1}>
              {tekst.meta}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  if (loading && werkbonnen.length === 0 && !error) return <LoadingScreen label="Planning laden…" />;

  const kop = (
    <AppTopBar
      variant="detail"
      title="Planning"
      subtitle="Weekplanning per medewerker en voertuig"
      onBack={() => terugOfNaar(router, '/menu')}
    />
  );

  if (error && werkbonnen.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen scroll={false} header={kop}>
          <ErrorState title="Planning niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  // Telefoon, week: één medewerker of voertuig tegelijk.
  const gekozenResource =
    gekozen !== undefined && resources.some((r) => r.id === gekozen) ? gekozen : (resources[0]?.id ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen header={kop} refreshing={refreshing} onRefresh={onRefresh}>
        {/* Dag/Week en Medewerkers/Voertuigen */}
        <View style={styles.schakelRij}>
          <Schakel
            opties={[
              ['dag', 'Dag'],
              ['week', 'Week'],
            ]}
            waarde={zicht}
            onChange={(v) => setZicht(v as Zicht)}
            styles={styles}
          />
          {metVoertuigen ? (
            <Schakel
              opties={[
                ['medewerker', 'Medewerkers'],
                ['voertuig', 'Voertuigen'],
              ]}
              waarde={actieveModus}
              onChange={(v) => {
                setModus(v as Modus);
                setGekozen(undefined);
              }}
              styles={styles}
            />
          ) : null}
        </View>

        <View style={styles.navRow}>
          <Pressable
            onPress={() => stap(-1)}
            accessibilityRole="button"
            accessibilityLabel={zicht === 'dag' ? 'Vorige dag' : 'Vorige week'}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronLeft size={20} color={t.ink} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.navLabel} numberOfLines={1}>
            {periodeLabel(zicht, anker, dagen)}
          </Text>
          <Pressable
            onPress={() => setAnker(vandaag)}
            accessibilityRole="button"
            accessibilityLabel="Naar vandaag"
            style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.todayBtnText}>Vandaag</Text>
          </Pressable>
          <Pressable
            onPress={() => stap(1)}
            accessibilityRole="button"
            accessibilityLabel={zicht === 'dag' ? 'Volgende dag' : 'Volgende week'}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronRight size={20} color={t.ink} strokeWidth={2.4} />
          </Pressable>
        </View>

        {deelFout ? (
          <View style={styles.pad}>
            <NoticeBanner toon="waarschuwing" message={deelFout} />
          </View>
        ) : null}
        {dubbel.size > 0 ? (
          <View style={styles.pad}>
            <NoticeBanner
              toon="waarschuwing"
              message="Blokken met een oranje driehoek zijn dubbel ingepland: dezelfde persoon of hetzelfde voertuig staat op dat moment op twee werkbonnen."
            />
          </View>
        ) : null}

        {/* Dagstrip bij dagweergave op een telefoon: snel naar een andere dag van de week. */}
        {zicht === 'dag' && !breed ? (
          <View style={styles.dagStrip}>
            {weekDatums.map((d) => {
              const aan = d === anker;
              return (
                <Pressable
                  key={d}
                  onPress={() => setAnker(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: aan }}
                  aria-pressed={aan}
                  style={[styles.dagKnop, aan && styles.dagKnopAan, d === vandaag && !aan && styles.dagKnopVandaag]}
                >
                  <Text style={[styles.dagKnopTekst, aan && styles.dagKnopTekstAan]}>{dagKort(d)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {resources.length === 0 ? (
          <View style={styles.pad}>
            <AppCard padding={20}>
              <Text style={styles.leeg}>
                {actieveModus === 'voertuig' ? 'Er zijn nog geen voertuigen.' : 'Er zijn nog geen teamleden.'}
              </Text>
            </AppCard>
          </View>
        ) : breed ? (
          /* iPad: breed rooster — rijen = medewerkers/voertuigen, kolommen = dagen. */
          <ScrollView horizontal contentContainerStyle={styles.roosterScroll} showsHorizontalScrollIndicator>
            <View style={[styles.rooster, dsShadow]}>
              <View style={styles.roosterRij}>
                <View style={[styles.roosterNaamCel, styles.roosterKopCel]} />
                {dagen.map((d) => (
                  <View
                    key={d}
                    style={[
                      zicht === 'dag' ? styles.roosterDagCelBreed : styles.roosterDagCel,
                      styles.roosterKopCel,
                      d === vandaag && styles.roosterVandaag,
                    ]}
                  >
                    <Text style={[styles.roosterKopTekst, d === vandaag && { color: t.green700 }]}>
                      {d === vandaag ? `${dagKort(d)} · vandaag` : dagKort(d)}
                    </Text>
                  </View>
                ))}
              </View>
              {resources.map((r) => (
                <View key={r.id ?? 'niemand'} style={styles.roosterRij}>
                  <View style={styles.roosterNaamCel}>
                    <View style={[styles.dot, { backgroundColor: r.kleur }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.roosterNaam} numberOfLines={2}>
                        {r.naam}
                      </Text>
                      {r.sub ? (
                        <Text style={styles.blokMeta} numberOfLines={1}>
                          {r.sub}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {dagen.map((d) => (
                    <View
                      key={d}
                      style={[
                        zicht === 'dag' ? styles.roosterDagCelBreed : styles.roosterDagCel,
                        d === vandaag && styles.roosterVandaag,
                        zicht === 'dag' && styles.roosterDagWrap,
                      ]}
                    >
                      {blokkenVan(r.id, d).map((b) => (
                        <View key={b.sleutel} style={zicht === 'dag' ? { width: 200 } : undefined}>
                          {blok(b, r.kleur, zicht === 'week')}
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        ) : zicht === 'dag' ? (
          /* Telefoon, dag: per medewerker (of voertuig) de blokken van die dag. */
          <View style={[styles.pad, { gap: 12 }]}>
            {resources.map((r) => {
              const lijst = blokkenVan(r.id, anker);
              return (
                <View key={r.id ?? 'niemand'} style={{ gap: 6 }}>
                  <View style={styles.resKop}>
                    <View style={[styles.dot, { backgroundColor: r.kleur }]} />
                    <Text style={styles.resNaam} numberOfLines={1}>
                      {r.naam}
                    </Text>
                    <Text style={styles.resAantal}>{lijst.length ? `${lijst.length}` : 'vrij'}</Text>
                  </View>
                  {lijst.map((b) => blok(b, r.kleur))}
                </View>
              );
            })}
          </View>
        ) : (
          /* Telefoon, week: kies een medewerker of voertuig, dan per dag. */
          <View style={{ gap: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRij}>
              {resources.map((r) => {
                const aan = r.id === gekozenResource;
                const aantal = blokken.filter((b) => b.resource === r.id).length;
                return (
                  <Pressable
                    key={r.id ?? 'niemand'}
                    onPress={() => setGekozen(r.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: aan }}
                    aria-pressed={aan}
                    style={[styles.chip, aan && styles.chipAan]}
                  >
                    <View style={[styles.dot, { backgroundColor: r.kleur }]} />
                    <Text style={[styles.chipTekst, aan && styles.chipTekstAan]} numberOfLines={1}>
                      {r.naam}
                    </Text>
                    <Text style={[styles.chipAantal, aan && styles.chipTekstAan]}>{aantal}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={[styles.pad, { gap: 10 }]}>
              {dagen.map((d) => {
                const r = resources.find((x) => x.id === gekozenResource);
                const lijst = blokkenVan(gekozenResource, d);
                return (
                  <View key={d} style={{ gap: 6 }}>
                    <Text style={[styles.dagKop, d === vandaag && { color: t.green700 }]}>
                      {d === vandaag ? `${dagKort(d)} · vandaag` : dagKort(d)}
                    </Text>
                    {lijst.length === 0 ? (
                      <Text style={styles.vrij}>Niet ingepland</Text>
                    ) : (
                      lijst.map((b) => blok(b, r?.kleur ?? ds.green))
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Niet-ingeplande werkbonnen (inklapbaar), zoals het dashboard. */}
        <View style={[styles.pad, { marginTop: 16 }]}>
          <Pressable
            onPress={() => setLosOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: losOpen }}
            aria-expanded={losOpen}
            style={styles.losKop}
          >
            <Text style={styles.losTitel}>Niet ingepland ({los.length})</Text>
            {losOpen ? (
              <ChevronUp size={18} color={t.muted} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={18} color={t.muted} strokeWidth={2.2} />
            )}
          </Pressable>
          {losOpen ? (
            los.length === 0 ? (
              <Text style={styles.vrij}>Alle werkbonnen zijn ingepland.</Text>
            ) : (
              <View style={[styles.losLijst, breed && styles.losLijstBreed]}>
                {los.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => openWerkbon(w.id)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.losKaart, breed && styles.losKaartBreed, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.losKaartTitel} numberOfLines={1}>
                      {[w.nummer, w.titel || 'Werkbon'].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.losKaartMeta} numberOfLines={1}>
                      {[
                        w.customer?.name,
                        w.assigned_to_ids?.length
                          ? w.assigned_to_ids.map((p) => naamVan.get(p) ?? 'Medewerker').join(', ')
                          : 'Niemand toegewezen',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )
          ) : null}
          <Text style={styles.voetnoot}>Inplannen en verschuiven doe je in het dashboard of op de werkbon.</Text>
        </View>
      </AppScreen>
    </View>
  );
}

function Schakel({
  opties,
  waarde,
  onChange,
  styles,
}: {
  opties: [string, string][];
  waarde: string;
  onChange: (v: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.schakel}>
      {opties.map(([id, label]) => {
        const aan = id === waarde;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: aan }}
            aria-pressed={aan}
            style={[styles.schakelKnop, aan && [styles.schakelKnopAan, dsShadow]]}
          >
            <Text style={[styles.schakelTekst, aan && styles.schakelTekstAan]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const NAAM_BREEDTE = 150;
const DAG_BREEDTE = 104;

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    pad: { paddingHorizontal: 16, paddingBottom: 8 },
    schakelRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
    schakel: { flexDirection: 'row', backgroundColor: t.bgAlt, borderRadius: 14, padding: 4, gap: 4, flexGrow: 1 },
    schakelKnop: { flex: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    schakelKnopAan: { backgroundColor: t.card },
    schakelTekst: { fontSize: 13.5, fontWeight: '600', color: t.muted },
    schakelTekstAan: { color: t.ink },

    navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
    navBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: t.ink, textAlign: 'center' },
    todayBtn: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: t.green50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayBtnText: { fontSize: 13, fontWeight: '700', color: t.green700 },

    dagStrip: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingBottom: 10 },
    dagKnop: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dagKnopAan: { backgroundColor: t.ink, borderColor: t.ink },
    dagKnopVandaag: { borderColor: ds.green, borderWidth: 1.5 },
    dagKnopTekst: { fontSize: 12, fontWeight: '700', color: t.ink },
    dagKnopTekstAan: { color: t.bg },

    dot: { width: 10, height: 10, borderRadius: 5 },
    resKop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    resNaam: { flex: 1, fontSize: 14, fontWeight: '700', color: t.ink },
    resAantal: { fontSize: 12, fontWeight: '600', color: t.muted },
    dagKop: { fontSize: 13, fontWeight: '700', color: t.ink, marginTop: 4, textTransform: 'capitalize' },
    vrij: { fontSize: 12.5, color: t.muted },
    leeg: { fontSize: 13.5, color: t.muted, textAlign: 'center' },

    blok: {
      flexDirection: 'row',
      gap: 10,
      minHeight: 44,
      padding: 10,
      borderRadius: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    blokCompact: { padding: 6, gap: 6, borderRadius: 8 },
    blokStreep: { width: 4, borderRadius: 2, alignSelf: 'stretch' },
    blokKop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    blokTijd: { fontSize: 11.5, fontWeight: '700', color: t.muted, flexShrink: 1 },
    blokTitel: { fontSize: 13.5, fontWeight: '600', color: t.ink, marginTop: 1 },
    blokMeta: { fontSize: 11.5, color: t.muted, marginTop: 1 },

    chipRij: { paddingHorizontal: 16, gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      maxWidth: 220,
      paddingHorizontal: 12,
      borderRadius: 22,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipAan: { backgroundColor: t.ink, borderColor: t.ink },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink, flexShrink: 1 },
    chipTekstAan: { color: t.bg },
    chipAantal: { fontSize: 12, fontWeight: '700', color: t.muted },

    roosterScroll: { paddingHorizontal: 16, paddingBottom: 8, flexGrow: 1 },
    rooster: {
      flexGrow: 1,
      borderRadius: ds.rMd,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      overflow: 'hidden',
    },
    roosterRij: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.line },
    roosterKopCel: { paddingVertical: 8, backgroundColor: t.bgAlt },
    roosterKopTekst: { fontSize: 12, fontWeight: '700', color: t.ink, textTransform: 'capitalize', paddingHorizontal: 6 },
    roosterNaamCel: {
      width: NAAM_BREEDTE,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 8,
      borderRightWidth: 1,
      borderRightColor: t.line,
    },
    roosterNaam: { fontSize: 13, fontWeight: '700', color: t.ink },
    roosterDagCel: {
      width: DAG_BREEDTE,
      padding: 4,
      gap: 4,
      borderRightWidth: 1,
      borderRightColor: t.line,
    },
    roosterDagCelBreed: { flex: 1, minWidth: 420, padding: 6, gap: 6 },
    roosterDagWrap: { flexDirection: 'row', flexWrap: 'wrap' },
    roosterVandaag: { backgroundColor: t.green50 },

    losKop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    losTitel: { fontSize: 15, fontWeight: '700', color: t.ink },
    losLijst: { gap: 8 },
    losLijstBreed: { flexDirection: 'row', flexWrap: 'wrap' },
    losKaart: {
      minHeight: 44,
      padding: 12,
      borderRadius: 12,
      backgroundColor: t.statusWarnBg,
      borderWidth: 1,
      borderColor: t.line,
    },
    losKaartBreed: { width: '48%' },
    losKaartTitel: { fontSize: 13.5, fontWeight: '700', color: t.ink },
    losKaartMeta: { fontSize: 12, color: t.muted, marginTop: 2 },
    voetnoot: { fontSize: 12, color: t.muted, marginTop: 12 },
  });
