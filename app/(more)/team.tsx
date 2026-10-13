import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { Info, UserPlus, UsersRound } from 'lucide-react-native';
import {
  AppKpiCard,
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
  getEigenaarId,
  getUserPermissions,
  inviteTeamMember,
  listTeamMembers,
  setUserPermissions,
  updateTeamMember,
  type TeamMemberRow,
} from '@/services/teamService';
import { PERMISSION_GROEPEN, type PermissionGroep } from '@/lib/permissionGroups';
import { BREDE_INZAGE_WAARSCHUWING, RECHT_UITLEG } from '@/lib/rechtenUitleg';
import {
  beheerStand,
  isEigenaar,
  rolInfo,
  rolLabel,
  rolOpties,
  statusWeergave,
  teamTellingen,
} from '@/lib/teamRegels';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { getUserId } from '@/lib/sessionContext';
import { useSave } from '@/lib/useSave';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Team — gelijk aan `TeamPage.jsx` van het dashboard.
 *
 * - Lijst: echte leden uit `profiles` + openstaande uitnodigingen uit
 *   `company_members`, met statkaarten Totaal / Actief / Uitgenodigd.
 * - Alle beheeracties alleen voor een beheerder (rolgate in de policies):
 *   uitnodigen (insert + mail via `send-email`), bewerken (uitnodiging direct,
 *   echt lid via RPC `bb_teamlid_bijwerken`), rechten (feature
 *   `rollen_rechten`), (de)activeren en verwijderen via de edge function
 *   `delete-team-member`.
 * - Beschermd: je eigen rij ("Jij"), de eigenaar ("Beschermd") en de laatste
 *   actieve beheerder. De server dwingt hetzelfde af; dit is de uitleg vooraf.
 *
 * Niet in de app: een profielfoto voor een teamlid uploaden. Het dashboard
 * schrijft die naar `company_members`, wat voor echte leden geen rij raakt.
 */

export default function TeamScreen() {
  return (
    <PermissionGate permission="team" label="Team">
      <TeamScreenInhoud />
    </PermissionGate>
  );
}

type UitnodigingConcept = {
  email: string;
  naam: string;
  telefoon: string;
  rol: string;
  urenPerWeek: string;
};

type BewerkConcept = {
  lid: TeamMemberRow;
  naam: string;
  telefoon: string;
  rol: string;
  urenPerWeek: string;
};

function TeamScreenInhoud() {
  const router = useRouter();
  const { colors: t, colorMode } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet, planStatus } = usePermissions();

  const [items, setItems] = useState<TeamMemberRow[]>([]);
  const [eigenaarId, setEigenaarId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uitnodiging, setUitnodiging] = useState<UitnodigingConcept | null>(null);
  const [bewerk, setBewerk] = useState<BewerkConcept | null>(null);
  const [rechtenVoor, setRechtenVoor] = useState<TeamMemberRow | null>(null);
  const [rechten, setRechten] = useState<Record<string, boolean>>({});
  const [rechtenLaden, setRechtenLaden] = useState(false);
  const [uitlegOpen, setUitlegOpen] = useState<string | null>(null);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveRechten, saving: rechtenBezig, error: rechtenFout } = useSave<unknown>();

  const isAdmin = mag('team', 'wijzigen');
  const magUitnodigen = mag('team', 'maken');
  const magRechten = mag('team', 'rechtenWijzigen');
  const eigenId = getUserId();

  const load = useCallback(async () => {
    setError(null);
    const [teamRes, eigenaar] = await Promise.all([listTeamMembers(), getEigenaarId()]);
    if (teamRes.error) setError(teamRes.error);
    else setItems(teamRes.data);
    setEigenaarId(eigenaar);
  }, []);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  const tellingen = teamTellingen(items);
  const limiet = planStatus?.limits?.gebruikers;
  const planStand =
    limiet && limiet.max != null ? `${limiet.gebruikt} / ${limiet.max} gebruikers` : undefined;

  // ── Uitnodigen ──────────────────────────────────────────────────────────
  const openUitnodiging = () => {
    if (!magUitnodigen) {
      Dialog.alert(
        'Uitnodigen niet mogelijk',
        waaromNiet('team', 'maken') ??
          'Je abonnement heeft geen ruimte voor een extra gebruiker. Pas je abonnement aan op het dashboard.',
      );
      return;
    }
    setSaveError(null);
    setUitnodiging({ email: '', naam: '', telefoon: '', rol: 'medewerker', urenPerWeek: '' });
  };

  const uitnodigingVersturen = () => {
    if (!uitnodiging) return;
    const uren = Number(uitnodiging.urenPerWeek.replace(',', '.') || 0);
    save(
      () =>
        inviteTeamMember({
          email: uitnodiging.email,
          full_name: uitnodiging.naam,
          phone: uitnodiging.telefoon,
          role: uitnodiging.rol,
          hours_per_week: uren,
        }),
      {
        onSuccess: async (res) => {
          const uitkomst = res as { mailVerstuurd?: boolean; mailFout?: string | null };
          setUitnodiging(null);
          if (uitkomst?.mailVerstuurd === false) {
            Dialog.alert(
              'Teamlid toegevoegd maar e-mail niet verstuurd',
              uitkomst.mailFout ??
                'De uitnodiging is geldig, maar de e-mail kon niet worden verzonden.',
            );
          }
          await herlaad();
        },
      },
    );
  };

  // ── Bewerken ────────────────────────────────────────────────────────────
  const openBewerken = (lid: TeamMemberRow) => {
    if (!isAdmin) return;
    setSaveError(null);
    setBewerk({
      lid,
      naam: lid.full_name,
      telefoon: lid.phone,
      rol: lid.role,
      urenPerWeek: lid.hours_per_week ? String(lid.hours_per_week) : '',
    });
  };

  const bewerkRol = bewerk ? rolInfo(bewerk.lid, items, eigenaarId, eigenId) : null;

  const bewerkingOpslaan = () => {
    if (!bewerk) return;
    const urenTekst = bewerk.urenPerWeek.replace(',', '.').trim();
    save(
      () =>
        updateTeamMember(bewerk.lid, {
          full_name: bewerk.naam,
          phone: bewerk.telefoon,
          // Een vergrendelde rol sturen we niet mee: de server weigert hem, en
          // dan mislukt ook het opslaan van de naam.
          role: bewerkRol?.vergrendeld ? undefined : bewerk.rol,
          hours_per_week: urenTekst === '' ? null : Number(urenTekst),
        }),
      {
        onSuccess: async () => {
          setBewerk(null);
          await herlaad();
        },
        succesMelding: 'Teamlid bijgewerkt',
      },
    );
  };

  const uitnodigingIntrekken = (lid: TeamMemberRow) => {
    Dialog.alert('Teamlid verwijderen?', 'De openstaande uitnodiging vervalt.', [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: () =>
          save(() => deleteInvite(lid.id), {
            onSuccess: async () => {
              setBewerk(null);
              await herlaad();
            },
            succesMelding: 'Teamlid verwijderd',
          }),
      },
    ]);
  };

  const wisselActief = (lid: TeamMemberRow) => {
    const naarInactief = lid.status === 'actief';
    const wie = lid.full_name || lid.email || 'Dit teamlid';
    Dialog.alert(
      naarInactief ? 'Teamlid deactiveren?' : 'Teamlid activeren?',
      naarInactief
        ? `${wie} kan daarna niet meer inloggen. Zijn werk blijft bewaard.`
        : `${wie} kan daarna weer inloggen.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: naarInactief ? 'Deactiveren' : 'Activeren',
          style: naarInactief ? 'destructive' : 'default',
          onPress: () =>
            save(() => (naarInactief ? deactivateTeamMember(lid.id) : activateTeamMember(lid.id)), {
              onSuccess: async () => {
                setBewerk(null);
                await herlaad();
              },
              succesMelding: naarInactief ? 'Teamlid gedeactiveerd' : 'Teamlid geactiveerd',
            }),
        },
      ],
    );
  };

  const teamlidVerwijderen = (lid: TeamMemberRow) => {
    if (lid.isUitnodiging) {
      uitnodigingIntrekken(lid);
      return;
    }
    Dialog.alert(
      'Teamlid verwijderen?',
      'Het account en de sessies worden verwijderd. Geboekte uren en werkbonnen blijven bestaan.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: () =>
            save(() => deleteTeamMember(lid.id), {
              onSuccess: async () => {
                setBewerk(null);
                await herlaad();
              },
              succesMelding: 'Teamlid verwijderd',
            }),
        },
      ],
    );
  };

  // ── Rechten ─────────────────────────────────────────────────────────────
  const openRechten = async (lid: TeamMemberRow) => {
    if (!magRechten) {
      Dialog.alert(
        'Rollen & rechten',
        waaromNiet('team', 'rechtenWijzigen') ??
          'Rollen & rechten zit niet in je abonnement. Dat zit in het Team-pakket.',
      );
      return;
    }
    setBewerk(null);
    setUitlegOpen(null);
    setRechtenVoor(lid);
    const leeg: Record<string, boolean> = {};
    for (const groep of PERMISSION_GROEPEN) for (const sub of groep.subs) leeg[sub.key] = false;
    setRechten(leeg);
    if (!lid.profile_id) return;
    setRechtenLaden(true);
    const { data } = await getUserPermissions(lid.profile_id);
    const kaart: Record<string, boolean> = {};
    for (const groep of PERMISSION_GROEPEN) {
      for (const sub of groep.subs) kaart[sub.key] = data.includes(sub.key);
    }
    setRechten(kaart);
    setRechtenLaden(false);
  };

  const zetRecht = (sleutel: string, aan: boolean, waarschuw?: boolean) => {
    if (aan && waarschuw) {
      Dialog.alert('Brede inzage', BREDE_INZAGE_WAARSCHUWING, [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Aanzetten', onPress: () => setRechten((r) => ({ ...r, [sleutel]: true })) },
      ]);
      return;
    }
    setRechten((r) => ({ ...r, [sleutel]: aan }));
  };

  const zetGroep = (groep: PermissionGroep, aan: boolean) => {
    const pas = () =>
      setRechten((r) => {
        const volgende = { ...r };
        for (const s of groep.subs) volgende[s.key] = aan;
        return volgende;
      });
    if (aan && groep.subs.some((s) => s.waarschuw && !rechten[s.key])) {
      Dialog.alert('Brede inzage', BREDE_INZAGE_WAARSCHUWING, [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Aanzetten', onPress: pas },
      ]);
      return;
    }
    pas();
  };

  const allesZetten = (aan: boolean) =>
    setRechten((r) => Object.fromEntries(Object.keys(r).map((k) => [k, aan])));

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
      succesMelding: 'Rechten opgeslagen',
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

  const avatar = (lid: TeamMemberRow) => {
    const kleuren = avatarKleuren(lid.full_name || lid.email || '?', colorMode === 'dark');
    if (lid.avatar_url) {
      return (
        <Image
          source={{ uri: lid.avatar_url }}
          style={[styles.avatar, lid.status === 'inactief' && styles.avatarUit]}
          accessibilityIgnoresInvertColors
        />
      );
    }
    return (
      <View
        style={[
          styles.avatar,
          { backgroundColor: kleuren.bg },
          lid.status === 'inactief' && styles.avatarUit,
        ]}
      >
        <Text style={[styles.avatarTekst, { color: kleuren.fg }]}>
          {initialen(lid.full_name || (lid.email ? lid.email.split('@')[0] : ''), '?')}
        </Text>
      </View>
    );
  };

  const statusPil = (lid: TeamMemberRow) => {
    const s = statusWeergave(lid);
    const kleur =
      s.toon === 'actief'
        ? { bg: t.statusApproveBg, fg: t.statusApproveFg }
        : s.toon === 'uitgenodigd'
          ? { bg: t.statusSubmitBg, fg: t.statusSubmitFg }
          : s.toon === 'mislukt'
            ? { bg: t.statusRejectBg, fg: t.statusRejectFg }
            : { bg: t.statusDraftBg, fg: t.statusDraftFg };
    return (
      <View style={[styles.pil, { backgroundColor: kleur.bg }]}>
        <Text style={[styles.pilTekst, { color: kleur.fg }]}>{s.label}</Text>
      </View>
    );
  };

  const ondertitel = (lid: TeamMemberRow) => {
    const delen = [rolLabel(lid.role)];
    if (isEigenaar(lid, eigenaarId)) delen.push('Eigenaar');
    if (lid.email) delen.push(lid.email);
    if (lid.hours_per_week > 0) delen.push(`${lid.hours_per_week}u/week`);
    if (lid.profile_id && lid.profile_id === eigenId) delen.push('Jij');
    if (lid.invite_email_failed_at && lid.invite_email_error) {
      delen.push(`Mail: ${lid.invite_email_error}`);
    }
    return delen.join(' · ');
  };

  const bewerkStand = bewerk ? beheerStand(bewerk.lid, items, eigenaarId, eigenId) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Team"
            subtitle={planStand ?? 'Teamleden en uitnodigingen'}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              isAdmin ? (
                <HeaderIconButton icon={UserPlus} label="Teamlid uitnodigen" onPress={openUitnodiging} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        <View style={styles.kpiRij}>
          <AppKpiCard label="Totaal" value={String(tellingen.totaal)} />
          <AppKpiCard label="Actief" value={String(tellingen.actief)} />
          <AppKpiCard label="Uitgenodigd" value={String(tellingen.uitgenodigd)} />
        </View>

        {items.length === 0 ? (
          <EmptyState
            icon={<UsersRound size={40} color={ds.green} strokeWidth={1.6} />}
            title="Nog geen teamleden"
            message={
              isAdmin
                ? 'Nodig je eerste teamlid uit via de knop rechtsboven.'
                : 'Er zijn nog geen teamleden.'
            }
          />
        ) : (
          <>
            <AppSection title="Teamleden" count={items.length} variant="eyebrow" />
            <AppListGroup>
              {items.map((lid, i) => (
                <AppListItem
                  key={lid.id}
                  first={i === 0}
                  leading={avatar(lid)}
                  title={lid.full_name || 'Geen naam'}
                  subtitle={ondertitel(lid)}
                  trailing={statusPil(lid)}
                  onPress={isAdmin ? () => openBewerken(lid) : undefined}
                />
              ))}
            </AppListGroup>
            <Text style={styles.voetnoot}>
              {isAdmin
                ? 'Tik op een teamlid om naam, rol en uren te wijzigen, rechten in te stellen, of hem te (de)activeren of verwijderen.'
                : 'Teamleden uitnodigen, rechten instellen en verwijderen doet een beheerder.'}
            </Text>
          </>
        )}
      </AppScreen>

      {/* Uitnodigen — velden zoals InviteModal in het dashboard */}
      <FormSheet
        visible={uitnodiging !== null}
        title="Teamlid uitnodigen"
        subtitle="De uitnodiging is 48 uur geldig"
        error={saveError}
        saving={saving}
        submitLabel="Uitnodiging versturen"
        submitDisabled={!uitnodiging?.email.trim()}
        onSubmit={uitnodigingVersturen}
        onClose={() => setUitnodiging(null)}
      >
        <FormField
          label="E-mailadres *"
          value={uitnodiging?.email ?? ''}
          onChangeText={(v) => setUitnodiging((c) => (c ? { ...c, email: v } : c))}
          placeholder="collega@bedrijf.nl"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          autoFocus
        />
        <FormField
          label="Volledige naam"
          value={uitnodiging?.naam ?? ''}
          onChangeText={(v) => setUitnodiging((c) => (c ? { ...c, naam: v } : c))}
          placeholder="Voor- en achternaam"
        />
        <FormField
          label="Telefoonnummer"
          value={uitnodiging?.telefoon ?? ''}
          onChangeText={(v) => setUitnodiging((c) => (c ? { ...c, telefoon: v } : c))}
          placeholder="06 12 34 56 78"
          keyboardType="phone-pad"
        />
        <Keuze
          label="Rol"
          opties={rolOpties('medewerker')}
          waarde={uitnodiging?.rol ?? 'medewerker'}
          onKies={(v) => setUitnodiging((c) => (c ? { ...c, rol: v } : c))}
          styles={styles}
        />
        <FormField
          label="Uren per week"
          value={uitnodiging?.urenPerWeek ?? ''}
          onChangeText={(v) => setUitnodiging((c) => (c ? { ...c, urenPerWeek: v } : c))}
          placeholder="40"
          keyboardType="decimal-pad"
          hint="0 tot 60"
        />
      </FormSheet>

      {/* Bewerken + beheeracties */}
      <FormSheet
        visible={bewerk !== null}
        title="Teamlid bewerken"
        subtitle={bewerk?.lid.email || undefined}
        error={saveError}
        saving={saving}
        submitLabel="Opslaan"
        onSubmit={bewerkingOpslaan}
        onClose={() => setBewerk(null)}
        destructive={
          bewerk && bewerkStand?.soort === 'acties' && !bewerkStand.geblokkeerd
            ? { label: 'Teamlid verwijderen', onPress: () => teamlidVerwijderen(bewerk.lid) }
            : undefined
        }
      >
        <FormField
          label="Volledige naam"
          value={bewerk?.naam ?? ''}
          onChangeText={(v) => setBewerk((c) => (c ? { ...c, naam: v } : c))}
          placeholder="Voor- en achternaam"
        />
        <FormField
          label="Telefoonnummer"
          value={bewerk?.telefoon ?? ''}
          onChangeText={(v) => setBewerk((c) => (c ? { ...c, telefoon: v } : c))}
          placeholder={bewerk?.lid.isUitnodiging ? '06 12 34 56 78' : 'Leeg laten = ongewijzigd'}
          keyboardType="phone-pad"
        />
        <Keuze
          label="Rol"
          opties={rolOpties(bewerk?.lid.role)}
          waarde={bewerk?.rol ?? 'medewerker'}
          onKies={(v) => setBewerk((c) => (c ? { ...c, rol: v } : c))}
          uitgeschakeld={bewerkRol?.vergrendeld}
          hint={bewerkRol?.vergrendeld ? bewerkRol.reden : undefined}
          styles={styles}
        />
        <FormField
          label="Uren per week"
          value={bewerk?.urenPerWeek ?? ''}
          onChangeText={(v) => setBewerk((c) => (c ? { ...c, urenPerWeek: v } : c))}
          placeholder={bewerk?.lid.isUitnodiging ? '40' : 'Leeg laten = ongewijzigd'}
          keyboardType="decimal-pad"
        />

        {bewerk ? (
          <View style={styles.beheerBlok}>
            <Text style={styles.label}>Toegang</Text>
            {bewerk.lid.role !== 'admin' ? (
              <Button
                label="Rechten instellen"
                variant="secondary"
                disabled={saving}
                style={!magRechten ? styles.halfZichtbaar : undefined}
                onPress={() => openRechten(bewerk.lid)}
              />
            ) : null}
            {bewerkStand?.soort === 'jij' ? (
              <Text style={styles.hint}>Dit ben jij. Jezelf deactiveren of verwijderen kan niet.</Text>
            ) : bewerkStand?.soort === 'beschermd' ? (
              <Text style={styles.hint}>Beschermd. {bewerkStand.geblokkeerd}</Text>
            ) : bewerk.lid.isUitnodiging ? null : (
              <>
                <Button
                  label={bewerk.lid.status === 'actief' ? 'Deactiveren' : 'Activeren'}
                  variant="secondary"
                  disabled={saving || Boolean(bewerkStand?.geblokkeerd)}
                  onPress={() => wisselActief(bewerk.lid)}
                />
                {bewerkStand?.geblokkeerd ? (
                  <Text style={styles.hint}>{bewerkStand.geblokkeerd}</Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </FormSheet>

      {/* Rechten per teamlid — zoals PermissionsModal */}
      <FormSheet
        visible={rechtenVoor !== null}
        title="Rechten instellen"
        subtitle={rechtenVoor?.full_name || rechtenVoor?.email}
        error={rechtenFout}
        saving={rechtenBezig}
        submitLabel="Opslaan"
        submitDisabled={!rechtenVoor?.profile_id || rechtenLaden}
        onSubmit={rechtenOpslaan}
        onClose={() => setRechtenVoor(null)}
      >
        {!rechtenVoor?.profile_id ? (
          <Text style={styles.waarschuwing}>
            Dit teamlid heeft de uitnodiging nog niet geaccepteerd. Rechten kunnen worden ingesteld
            zodra ze zijn ingelogd.
          </Text>
        ) : null}
        <View style={styles.allesRij}>
          <View style={{ flex: 1 }}>
            <Button label="Alles aan" variant="secondary" disabled={rechtenBezig} onPress={() => allesZetten(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Alles uit" variant="secondary" disabled={rechtenBezig} onPress={() => allesZetten(false)} />
          </View>
        </View>
        {PERMISSION_GROEPEN.map((groep) => {
          const aan = groep.subs.filter((s) => rechten[s.key]).length;
          const alles = aan === groep.subs.length;
          const deels = aan > 0 && !alles;
          return (
            <View key={groep.key} style={{ gap: spacing.sm }}>
              <View style={styles.groepKop}>
                <Text style={[styles.groepTitel, { flex: 1 }]}>
                  {groep.label}
                  {deels ? ` · ${aan} van ${groep.subs.length}` : ''}
                </Text>
                <Switch
                  value={alles}
                  onValueChange={(v) => zetGroep(groep, v)}
                  disabled={rechtenBezig || rechtenLaden}
                  accessibilityLabel={`Alle rechten in ${groep.label}`}
                />
              </View>
              {groep.subs.map((sub) => (
                <View key={sub.key} style={styles.rechtRij}>
                  <View style={styles.rechtBoven}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rechtTitel}>{sub.label}</Text>
                      <Text style={styles.rechtUitleg}>{sub.kort}</Text>
                    </View>
                    {RECHT_UITLEG[sub.key] ? (
                      <Pressable
                        onPress={() => setUitlegOpen((o) => (o === sub.key ? null : sub.key))}
                        accessibilityRole="button"
                        accessibilityLabel={`Uitleg bij ${sub.label}`}
                        style={styles.infoKnop}
                      >
                        <Info size={16} color={t.muted} />
                      </Pressable>
                    ) : null}
                    <Switch
                      value={rechten[sub.key] === true}
                      onValueChange={(v) => zetRecht(sub.key, v, sub.waarschuw)}
                      disabled={rechtenBezig || rechtenLaden}
                      accessibilityLabel={sub.label}
                    />
                  </View>
                  {uitlegOpen === sub.key ? (
                    <Text style={styles.rechtLang}>{RECHT_UITLEG[sub.key]}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
      </FormSheet>
    </View>
  );
}

function Keuze({
  label,
  opties,
  waarde,
  onKies,
  uitgeschakeld,
  hint,
  styles,
}: {
  label: string;
  opties: { id: string; label: string }[];
  waarde: string;
  onKies: (id: string) => void;
  uitgeschakeld?: boolean;
  hint?: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRij}>
        {opties.map((o) => {
          const actief = waarde === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => onKies(o.id)}
              disabled={uitgeschakeld}
              accessibilityRole="button"
              accessibilityState={{ selected: actief, disabled: uitgeschakeld }}
              style={[styles.chip, actief && styles.chipActief, uitgeschakeld && styles.halfZichtbaar]}
            >
              <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    kpiRij: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
    },
    avatarUit: { opacity: 0.45 },
    avatarTekst: { fontSize: 12.5, fontWeight: '800' },
    pil: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
    pilTekst: { fontSize: 11.5, fontWeight: '700' },
    label: { ...typography.label, color: t.muted2 },
    hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.lineStrong,
    },
    // Gekozen: massief merkgroen met zwarte tekst, leesbaar in licht én donker.
    chipActief: { backgroundColor: t.green, borderColor: t.green },
    chipTekst: { fontSize: 14, fontWeight: '600', color: t.ink2 },
    chipTekstActief: { color: t.greenInk },
    halfZichtbaar: { opacity: 0.55 },
    beheerBlok: {
      gap: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.lineStrong,
    },
    waarschuwing: {
      fontSize: 13,
      lineHeight: 19,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.statusWarnBg,
      color: t.statusWarnFg,
      fontWeight: '600',
    },
    allesRij: { flexDirection: 'row', gap: spacing.sm },
    groepKop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
    groepTitel: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: t.muted,
    },
    rechtRij: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    rechtBoven: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    infoKnop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    rechtTitel: { fontSize: 14, fontWeight: '700', color: t.ink },
    rechtUitleg: { fontSize: 12.5, lineHeight: 17, color: t.muted, marginTop: 2 },
    rechtLang: { fontSize: 12.5, lineHeight: 18, color: t.ink2 },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
