import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarCheck,
  Check,
  CheckCircle2,
  ListChecks,
  Mail,
  Phone,
  Plus,
  RotateCcw,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import {
  ActivityFormSheet,
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  EmptyState,
  ErrorState,
  HeaderIconButton,
  LoadingScreen,
  conceptVanActiviteit,
  leegConcept,
  type ActivityConcept,
  type SelectOption,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  activiteitTypeLabel,
  listRecentActivities,
  setActivityCompleted,
  type ActivityRow,
} from '@/services/activityService';
import { listCustomers } from '@/services/customerService';
import { listCompanyProfiles } from '@/services/teamService';
import { useSave } from '@/lib/useSave';
import { formatDateNL } from '@/lib/format';
import { ds, spacing, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';

/**
 * Activiteiten — bellen, mailen, bezoeken, taken en opvolgacties.
 *
 * De RLS op `activities` geeft schrijfrecht aan iedereen binnen het bedrijf;
 * alleen aanmaken valt onder de read-onlygate. De SELECT-policy is juist
 * stréngér dan de schrijfpolicies (gedeelde werkruimte, planning- of
 * agenda_inzien-recht, of zelf toegewezen zijn) — daarom wijst de service een
 * nieuwe activiteit standaard aan jezelf toe, anders is hij na het opslaan
 * onvindbaar voor de maker.
 */

const TYPE_ICON: Record<string, LucideIcon> = {
  call: Phone,
  email: Mail,
  visit: Users,
  meeting: Users,
  task: ListChecks,
  follow: RotateCcw,
  note: ListChecks,
};

function iconFor(type: string | null): LucideIcon {
  return (type && TYPE_ICON[type]) || CalendarCheck;
}

function subtitleFor(a: ActivityRow): string {
  const delen: string[] = [activiteitTypeLabel(a.type)];
  if (a.customer?.name) delen.push(a.customer.name);
  if (a.due_at) delen.push(formatDateNL(a.due_at));
  if (a.completed) delen.push('Voltooid');
  return delen.join(' · ');
}

export default function ActivitiesScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [items, setItems] = useState<ActivityRow[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [medewerkers, setMedewerkers] = useState<SelectOption[]>([]);  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState<ActivityConcept | null>(null);

  // Aparte opslag-hook voor de afvinkknop in de lijst: die staat los van het
  // formulier en mag zijn eigen bezig-stand hebben.
  const { save: saveVink, saving: vinkBezig, error: vinkFout } = useSave<unknown>();

  const magMaken = mag('activiteiten', 'maken');
  const magWijzigen = mag('activiteiten', 'wijzigen');
  const magAfronden = mag('activiteiten', 'afronden');

  const load = useCallback(async () => {
    setError(null);

    const [actRes, klantRes, teamRes] = await Promise.all([
      listRecentActivities(),
      listCustomers(),
      listCompanyProfiles(),
    ]);

    if (actRes.error) setError(actRes.error);
    else setItems(actRes.data);

    // De keuzelijsten zijn hulpmiddelen: mislukken ze, dan blijft de activiteit
    // gewoon te maken — zonder klant of zonder expliciete toewijzing.
    if (!klantRes.error) {
      setKlanten(klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant', sub: k.city ?? undefined })));
    }
    if (!teamRes.error) {
      setMedewerkers(
        teamRes.data
          .filter((p) => p.actief)
          .map((p) => ({ id: p.id, label: p.full_name, sub: p.role })),
      );
    }
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });



  const vink = (a: ActivityRow) => {
    if (!magAfronden || vinkBezig) return;
    saveVink(() => setActivityCompleted(a.id, !a.completed), {
      onSuccess: async () => herlaad(),
    });
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Activiteiten laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Activiteiten" onBack={() => router.back()} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const open = items.filter((a) => !a.completed);
  const gedaan = items.filter((a) => a.completed);

  const lijst = (rijen: ActivityRow[]) => (
    <AppListGroup>
      {rijen.map((a, i) => (
        <AppListItem
          key={a.id}
          first={i === 0}
          icon={iconFor(a.type)}
          title={a.title || 'Activiteit'}
          subtitle={subtitleFor(a)}
          onPress={magWijzigen ? () => setConcept(conceptVanActiviteit(a)) : undefined}
          trailing={
            magAfronden ? (
              <Pressable
                onPress={() => vink(a)}
                disabled={vinkBezig}
                hitSlop={10}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: a.completed }}
                accessibilityLabel={a.completed ? 'Heropenen' : 'Afronden'}
                style={[styles.vink, a.completed && styles.vinkAan, vinkBezig && { opacity: 0.5 }]}
              >
                {a.completed ? <Check size={15} color={ds.greenInk} strokeWidth={3} /> : null}
              </Pressable>
            ) : undefined
          }
        />
      ))}
    </AppListGroup>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Activiteiten"
            subtitle={`${open.length} open · ${gedaan.length} afgerond`}
            onBack={() => router.back()}
            rightAction={
              magMaken ? (
                <HeaderIconButton
                  icon={Plus}
                  label="Nieuwe activiteit"
                  onPress={() => setConcept(leegConcept('call'))}
                />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {vinkFout ? (
          <View style={styles.foutBanner}>
            <Text style={styles.foutTekst}>{vinkFout}</Text>
          </View>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen activiteiten"
            message={
              magMaken
                ? 'Leg met de plusknop je eerste actie vast.'
                : (waaromNiet('activiteiten', 'maken') ??
                  'Er staan nog geen activiteiten klaar voor dit bedrijf.')
            }
          />
        ) : (
          <>
            {open.length > 0 ? (
              <>
                <AppSection title="Open" count={open.length} variant="eyebrow" />
                {lijst(open)}
              </>
            ) : null}
            {gedaan.length > 0 ? (
              <>
                <AppSection title="Afgerond" count={gedaan.length} variant="eyebrow" />
                {lijst(gedaan)}
              </>
            ) : null}
          </>
        )}
      </AppScreen>

      <ActivityFormSheet
        concept={concept}
        klanten={klanten}
        medewerkers={medewerkers}
        onClose={() => setConcept(null)}
        onSaved={() => herlaad()}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    vink: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.6,
      borderColor: t.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vinkAan: { backgroundColor: ds.green, borderColor: ds.green },
    foutBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: t.rMd,
      backgroundColor: t.statusRejectBg,
    },
    foutTekst: { fontSize: 13, fontWeight: '600', color: t.statusRejectFg },
  });
