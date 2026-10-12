import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { MailWarning, ShieldCheck, UserPlus, UsersRound } from 'lucide-react-native';
import {
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  PermissionGate,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  activateTeamMember,
  deactivateTeamMember,
  deleteInvite,
  deleteTeamMember,
  getUserPermissions,
  inviteTeamMember,
  listTeamMembers,
  setUserPermissions,
  telActieveAdmins,
  updateInvite,
  type TeamMemberRow,
} from '@/services/teamService';
import { PERMISSION_GROEPEN } from '@/lib/permissionGroups';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { getUserId } from '@/lib/sessionContext';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Team — echte teamleden komen uit `profiles`, openstaande uitnodigingen uit
 * `company_members`. Beheer is admin-only (rolgate in de policy, geen recht).
 *
 * Wat de app bewust NIET doet: de rol van een bestaand teamlid wijzigen. De
 * UPDATE-policy op `profiles` is `id = auth.uid()` — een beheerder kan de rol
 * van een ánder profiel client-side niet aanpassen, ook het dashboard niet. Dat
 * is server-werk; zie MOBILE_SERVERWIJZIGINGEN.sql. Een knop tonen die
 * gegarandeerd op 42501 uitkomt is erger dan geen knop.
 *
 * Bescherming tegen jezelf buitensluiten: je eigen rij heeft geen deactiveer- of
 * verwijderknop (zelfde keuze als het dashboard, dat daar "Jij" toont), en
 * de laatste actieve beheerder kan niet worden gedeactiveerd of verwijderd.
 */

const ROL_LABEL: Record<string, string> = {
  admin: 'Beheerder',
  planner: 'Planner',
  medewerker: 'Medewerker',
};

const ROLLEN = [
  { id: 'medewerker', label: 'Medewerker' },
  { id: 'admin', label: 'Beheerder' },
];

function initialenVan(naam: string, email: string): string {
  return initialen(naam || email.split('@')[0], '?');
}

function subtitleFor(m: TeamMemberRow): string {
  const delen: string[] = [ROL_LABEL[m.role] ?? m.role];
  if (m.isUitnodiging) {
    delen.push(m.invite_email_failed_at ? 'Uitnodiging niet verstuurd' : 'Uitgenodigd');
  } else if (m.status === 'inactief') {
    delen.push('Inactief');
  }
  if (m.email) delen.push(m.email);
  return delen.join(' · ');
}

export default function TeamScreen() {
  return (
    <PermissionGate permission="team" label="Team">
      <TeamScreenInhoud />
    </PermissionGate>
  );
}

type UitnodigingConcept = {
  /** null = nieuwe uitnodiging. */
  id: string | null;
  email: string;
  naam: string;
  telefoon: string;
  rol: string;
  urenPerWeek: string;
};

function TeamScreenInhoud() {
  const router = useRouter();
  const { colors: t, colorMode } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [items, setItems] = useState<TeamMemberRow[]>([]);
  const [aantalAdmins, setAantalAdmins] = useState(0);  const [error, setError] = useState<string | null>(null);

  const [concept, setConcept] = useState<UitnodigingConcept | null>(null);
  const [rechtenVoor, setRechtenVoor] = useState<TeamMemberRow | null>(null);
  const [rechten, setRechten] = useState<Record<string, boolean>>({});

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveRechten, saving: rechtenBezig, error: rechtenFout } = useSave<unknown>();

  const magUitnodigen = mag('team', 'maken');
  const magBeheren = mag('team', 'wijzigen');
  const magVerwijderen = mag('team', 'verwijderen');
  const magRechten = mag('team', 'rechtenWijzigen');
  const eigenId = getUserId();

  const load = useCallback(async () => {
    setError(null);
    const [teamRes, admins] = await Promise.all([listTeamMembers(), telActieveAdmins()]);
    if (teamRes.error) setError(teamRes.error);
    else setItems(teamRes.data);
    setAantalAdmins(admins);
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });



  /**
   * Mag dit teamlid (de)activeren of verwijderen? Twee vangnetten die het
   * dashboard ook heeft, zodat niemand per ongeluk de deur achter zich
   * dichttrekt.
   */
  const beschermd = (m: TeamMemberRow): string | null => {
    if (m.profile_id && m.profile_id === eigenId) return 'Dit ben jij.';
    if (m.role === 'admin' && m.status === 'actief' && aantalAdmins <= 1) {
      return 'Dit is de laatste actieve beheerder.';
    }
    return null;
  };

  const openUitnodiging = () => {
    setSaveError(null);
    setConcept({ id: null, email: '', naam: '', telefoon: '', rol: 'medewerker', urenPerWeek: '' });
  };

  const openUitnodigingBewerken = (m: TeamMemberRow) => {
    setSaveError(null);
    setConcept({
      id: m.id,
      email: m.email,
      naam: m.full_name,
      telefoon: m.phone,
      rol: m.role,
      urenPerWeek: m.hours_per_week ? String(m.hours_per_week) : '',
    });
  };

  const uitnodigingOpslaan = () => {
    if (!concept) return;
    const uren = Number(concept.urenPerWeek.replace(',', '.') || 0);
    save(
      () =>
        concept.id
          ? updateInvite(concept.id, {
              full_name: concept.naam,
              phone: concept.telefoon,
              role: concept.rol,
              hours_per_week: uren,
            })
          : inviteTeamMember({
              email: concept.email,
              full_name: concept.naam,
              phone: concept.telefoon,
              role: concept.rol,
              hours_per_week: uren,
            }),
      {
        onSuccess: async (res) => {
          const uitkomst = res as { mailVerstuurd?: boolean; mailFout?: string | null };
          setConcept(null);
          // Eerlijk zijn over de mail: de uitnodiging staat er, maar als de
          // mail niet weg is moet iemand de link zelf doorgeven.
          if (uitkomst?.mailVerstuurd === false) {
            Dialog.alert(
              'Uitnodiging aangemaakt, mail niet verstuurd',
              'De uitnodiging is geldig, maar de e-mail kon niet worden verzonden. ' +
                'Probeer het opnieuw vanaf het dashboard of stuur de link handmatig.',
            );
          }
          await herlaad();
        },
      },
    );
  };

  const uitnodigingIntrekken = () => {
    if (!concept?.id) return;
    const id = concept.id;
    bevestigVerwijderen('Uitnodiging', () => {
      save(() => deleteInvite(id), {
        onSuccess: async () => {
          setConcept(null);
          await herlaad();
        },
      });
    });
  };

  const wisselActief = (m: TeamMemberRow) => {
    const blokkade = beschermd(m);
    if (blokkade) {
      Dialog.alert('Niet mogelijk', `${blokkade} Deze actie is daarom uitgeschakeld.`);
      return;
    }
    const naarInactief = m.status === 'actief';
    Dialog.alert(
      naarInactief ? 'Teamlid deactiveren?' : 'Teamlid activeren?',
      naarInactief
        ? `${m.full_name || m.email} kan daarna niet meer inloggen. Zijn werk blijft bewaard.`
        : `${m.full_name || m.email} kan daarna weer inloggen.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: naarInactief ? 'Deactiveren' : 'Activeren',
          style: naarInactief ? 'destructive' : 'default',
          onPress: () => {
            save(
              () => (naarInactief ? deactivateTeamMember(m.id) : activateTeamMember(m.id)),
              { onSuccess: async () => herlaad() },
            );
          },
        },
      ],
    );
  };

  const teamlidVerwijderen = (m: TeamMemberRow) => {
    const blokkade = beschermd(m);
    if (blokkade) {
      Dialog.alert('Niet mogelijk', `${blokkade} Verwijderen is daarom uitgeschakeld.`);
      return;
    }
    bevestigVerwijderen(
      'Teamlid',
      () => {
        save(() => deleteTeamMember(m.id), {
          onSuccess: async () => herlaad(),
        });
      },
      'Het account en de sessies worden verwijderd. Geboekte uren en werkbonnen blijven bestaan.',
    );
  };

  const openRechten = async (m: TeamMemberRow) => {
    if (!m.profile_id) {
      Dialog.alert('Nog niet mogelijk', 'Dit teamlid heeft de uitnodiging nog niet geaccepteerd.');
      return;
    }
    setRechtenVoor(m);
    setRechten({});
    const { data } = await getUserPermissions(m.profile_id);
    const kaart: Record<string, boolean> = {};
    for (const groep of PERMISSION_GROEPEN) {
      for (const sub of groep.subs) kaart[sub.key] = data.includes(sub.key);
    }
    setRechten(kaart);
  };

  const rechtenOpslaan = () => {
    const lid = rechtenVoor;
    if (!lid?.profile_id) return;
    const toegekend = Object.entries(rechten)
      .filter(([, aan]) => aan)
      .map(([sleutel]) => sleutel);
    saveRechten(() => setUserPermissions(lid.profile_id as string, toegekend), {
      onSuccess: async () => {
        setRechtenVoor(null);
        await herlaad();
      },
    });
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Team laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Team" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const leden = items.filter((m) => !m.isUitnodiging);
  const uitnodigingen = items.filter((m) => m.isUitnodiging);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Team"
            subtitle={`${leden.length} ${leden.length === 1 ? 'teamlid' : 'teamleden'}`}
            meta={uitnodigingen.length > 0 ? `${uitnodigingen.length} open` : undefined}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magUitnodigen ? (
                <HeaderIconButton
                  icon={UserPlus}
                  label="Teamlid uitnodigen"
                  onPress={openUitnodiging}
                />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {saveError ? (
          <View style={styles.foutBanner}>
            <Text style={styles.foutTekst}>{saveError}</Text>
          </View>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            icon={<UsersRound size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen teamleden"
            message={
              magUitnodigen
                ? 'Nodig met de knop rechtsboven je eerste collega uit.'
                : (waaromNiet('team', 'maken') ?? 'Er zijn nog geen teamleden.')
            }
          />
        ) : (
          <>
            <AppSection title="Teamleden" count={leden.length} variant="eyebrow" />
            <AppListGroup>
              {leden.map((m, i) => (
                <AppListItem
                  key={m.id}
                  first={i === 0}
                  leading={
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: avatarKleuren(
                            m.full_name || m.email,
                            colorMode === 'dark',
                          ).bg,
                        },
                        m.status === 'inactief' && styles.avatarUit,
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarTekst,
                          {
                            color: avatarKleuren(m.full_name || m.email, colorMode === 'dark').fg,
                          },
                        ]}
                      >{initialenVan(m.full_name, m.email)}</Text>
                    </View>
                  }
                  title={m.full_name || m.email || 'Naamloos'}
                  subtitle={subtitleFor(m)}
                  trailing={
                    magBeheren ? (
                      <View style={styles.acties}>
                        {/* Rechten: het dashboard verbergt dit bij een admin,
                            want die heeft per definitie alles. */}
                        {m.role !== 'admin' ? (
                          <Pressable
                            onPress={() =>
                              magRechten
                                ? openRechten(m)
                                : Dialog.alert(
                                    'Niet beschikbaar',
                                    waaromNiet('team', 'rechtenWijzigen') ??
                                      'Rechten beheren zit niet in je abonnement.',
                                  )
                            }
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Rechten van ${m.full_name || m.email}`}
                            style={[styles.actieKnop, !magRechten && styles.actieUit]}
                          >
                            <ShieldCheck size={15} color={t.muted} />
                          </Pressable>
                        ) : null}
                        {beschermd(m) === null ? (
                          <Switch
                            value={m.status === 'actief'}
                            onValueChange={() => wisselActief(m)}
                            disabled={saving}
                          />
                        ) : (
                          <Text style={styles.beschermd}>
                            {m.profile_id === eigenId ? 'Jij' : 'Laatste beheerder'}
                          </Text>
                        )}
                      </View>
                    ) : undefined
                  }
                  onPress={
                    magVerwijderen && beschermd(m) === null
                      ? () => teamlidVerwijderen(m)
                      : undefined
                  }
                />
              ))}
            </AppListGroup>

            {uitnodigingen.length > 0 ? (
              <>
                <AppSection title="Openstaande uitnodigingen" count={uitnodigingen.length} variant="eyebrow" />
                <AppListGroup>
                  {uitnodigingen.map((m, i) => (
                    <AppListItem
                      key={m.id}
                      first={i === 0}
                      icon={m.invite_email_failed_at ? MailWarning : UserPlus}
                      title={m.full_name || m.email}
                      subtitle={subtitleFor(m)}
                      onPress={magBeheren ? () => openUitnodigingBewerken(m) : undefined}
                    />
                  ))}
                </AppListGroup>
              </>
            ) : null}

            {magBeheren ? (
              <Text style={styles.voetnoot}>
                Tik op een teamlid om hem te verwijderen, of gebruik de schakelaar om hem te
                (de)activeren. De rol van een bestaand teamlid wijzig je op het dashboard.
              </Text>
            ) : null}
          </>
        )}
      </AppScreen>

      {/* Uitnodigen / uitnodiging bewerken */}
      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Uitnodiging bewerken' : 'Teamlid uitnodigen'}
        subtitle={concept?.id ? concept.email : 'De uitnodiging is 48 uur geldig'}
        error={saveError}
        saving={saving}
        submitLabel={concept?.id ? 'Opslaan' : 'Uitnodiging versturen'}
        submitDisabled={!concept?.id && !concept?.email.trim()}
        onSubmit={uitnodigingOpslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id && magVerwijderen
            ? { label: 'Uitnodiging intrekken', onPress: uitnodigingIntrekken }
            : undefined
        }
      >
        {!concept?.id ? (
          <FormField
            label="E-mailadres"
            value={concept?.email ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, email: v } : c))}
            placeholder="collega@bedrijf.nl"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            autoFocus
          />
        ) : null}
        <FormField
          label="Naam"
          value={concept?.naam ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, naam: v } : c))}
          placeholder="Voor- en achternaam"
        />
        <FormField
          label="Telefoon"
          value={concept?.telefoon ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, telefoon: v } : c))}
          placeholder="06 12 34 56 78"
          keyboardType="phone-pad"
        />
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Rol</Text>
          <View style={styles.chipRij}>
            {ROLLEN.map((r) => {
              const actief = concept?.rol === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setConcept((c) => (c ? { ...c, rol: r.id } : c))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actief }}
                  style={[styles.chip, actief && styles.chipActief]}
                >
                  <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            Een beheerder mag alles. Wat een medewerker mag stel je daarna per recht in.
          </Text>
        </View>
        <FormField
          label="Uren per week"
          value={concept?.urenPerWeek ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, urenPerWeek: v } : c))}
          placeholder="40"
          keyboardType="decimal-pad"
        />
      </FormSheet>

      {/* Rechten per teamlid */}
      <FormSheet
        visible={rechtenVoor !== null}
        title="Rechten"
        subtitle={rechtenVoor?.full_name || rechtenVoor?.email}
        error={rechtenFout}
        saving={rechtenBezig}
        submitLabel="Rechten opslaan"
        onSubmit={rechtenOpslaan}
        onClose={() => setRechtenVoor(null)}
      >
        {PERMISSION_GROEPEN.map((groep) => (
          <View key={groep.key} style={{ gap: spacing.sm }}>
            <Text style={styles.groepTitel}>{groep.label}</Text>
            {groep.subs.map((sub) => (
              <View key={sub.key} style={styles.rechtRij}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rechtTitel}>{sub.label}</Text>
                  <Text style={styles.rechtUitleg}>{sub.kort}</Text>
                </View>
                <Switch
                  value={rechten[sub.key] === true}
                  onValueChange={(aan) => {
                    // Brede inzage: het dashboard vraagt hier expliciet om
                    // bevestiging, omdat dit het werk van álle collega's opent.
                    if (aan && sub.waarschuw) {
                      Dialog.alert(
                        'Brede inzage',
                        'Met dit recht ziet dit teamlid de projecten en werkbonnen van het hele ' +
                          'team, niet alleen die van zichzelf. Weet je het zeker?',
                        [
                          { text: 'Annuleren', style: 'cancel' },
                          {
                            text: 'Aanzetten',
                            onPress: () => setRechten((r) => ({ ...r, [sub.key]: true })),
                          },
                        ],
                      );
                      return;
                    }
                    setRechten((r) => ({ ...r, [sub.key]: aan }));
                  }}
                  disabled={rechtenBezig}
                />
              </View>
            ))}
          </View>
        ))}
        <Button
          label="Alles uitzetten"
          variant="secondary"
          disabled={rechtenBezig}
          onPress={() =>
            setRechten((r) => Object.fromEntries(Object.keys(r).map((k) => [k, false])))
          }
        />
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.green50,
    },
    avatarUit: { backgroundColor: t.bgAlt },
    avatarTekst: { fontSize: 12.5, fontWeight: '800', color: t.greenInk },
    acties: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    actieKnop: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
    },
    actieUit: { opacity: 0.45 },
    beschermd: { fontSize: 11.5, fontWeight: '700', color: t.muted2 },
    label: { ...typography.label, color: t.ink2 },
    hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipActief: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    chipTekstActief: { color: t.greenInk },
    groepTitel: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: t.muted,
    },
    rechtRij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    rechtTitel: { fontSize: 14, fontWeight: '700', color: t.ink },
    rechtUitleg: { fontSize: 12.5, lineHeight: 17, color: t.muted, marginTop: 2 },
    foutBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.statusRejectBg,
    },
    foutTekst: { fontSize: 13, fontWeight: '600', color: t.statusRejectFg },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
