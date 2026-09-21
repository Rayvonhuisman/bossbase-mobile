import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, CheckCircle2, ListChecks, Plus } from 'lucide-react-native';
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
  listOpenTasks,
  setActivityCompleted,
  type ActivityRow,
} from '@/services/activityService';
import { listCustomers } from '@/services/customerService';
import { listCompanyProfiles } from '@/services/teamService';
import { useSave } from '@/lib/useSave';
import { formatDateNL } from '@/lib/format';
import { vandaagIso } from '@/lib/nlTijd';
import { ds, spacing, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';

/**
 * Taken — hetzelfde `activities`-record als op het Activiteiten-scherm, met
 * `type = 'task'` en `completed = false`. Er is geen aparte takentabel; wie hier
 * een taak afvinkt ziet dat op het dashboard terug als afgeronde activiteit.
 */

function subtitleFor(a: ActivityRow): string {
  const delen: string[] = [];
  if (a.customer?.name) delen.push(a.customer.name);
  if (a.due_at) {
    const dag = a.due_at.slice(0, 10);
    const teLaat = dag < vandaagIso();
    delen.push(`${teLaat ? 'Te laat · ' : 'Deadline '}${formatDateNL(a.due_at)}`);
  }
  return delen.join(' · ') || 'Open taak';
}

export default function TasksScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [items, setItems] = useState<ActivityRow[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [medewerkers, setMedewerkers] = useState<SelectOption[]>([]);  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState<ActivityConcept | null>(null);

  const { save: saveVink, saving: vinkBezig, error: vinkFout } = useSave<unknown>();

  const magMaken = mag('activiteiten', 'maken');
  const magWijzigen = mag('activiteiten', 'wijzigen');
  const magAfronden = mag('activiteiten', 'afronden');

  const load = useCallback(async () => {
    setError(null);

    const [taakRes, klantRes, teamRes] = await Promise.all([
      listOpenTasks(),
      listCustomers(),
      listCompanyProfiles(),
    ]);

    if (taakRes.error) setError(taakRes.error);
    else setItems(taakRes.data);
    if (!klantRes.error) {
      setKlanten(klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant', sub: k.city ?? undefined })));
    }
    if (!teamRes.error) {
      setMedewerkers(
        teamRes.data.filter((p) => p.actief).map((p) => ({ id: p.id, label: p.full_name, sub: p.role })),
      );
    }
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });



  const afronden = (a: ActivityRow) => {
    if (!magAfronden || vinkBezig) return;
    saveVink(() => setActivityCompleted(a.id, true), {
      onSuccess: async () => herlaad(),
    });
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Taken laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Taken" onBack={() => router.back()} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Taken"
            subtitle={`${items.length} open ${items.length === 1 ? 'taak' : 'taken'}`}
            onBack={() => router.back()}
            rightAction={
              magMaken ? (
                <HeaderIconButton
                  icon={Plus}
                  label="Nieuwe taak"
                  onPress={() => setConcept(leegConcept('task'))}
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
            title="Geen open taken"
            message={
              magMaken
                ? 'Je hebt geen openstaande taken. Voeg er met de plusknop een toe.'
                : (waaromNiet('activiteiten', 'maken') ?? 'Je hebt geen openstaande taken.')
            }
          />
        ) : (
          <>
            <AppSection title="Open taken" count={items.length} variant="eyebrow" />
            <AppListGroup>
              {items.map((a, i) => (
                <AppListItem
                  key={a.id}
                  first={i === 0}
                  icon={ListChecks}
                  title={a.title || 'Taak'}
                  subtitle={subtitleFor(a)}
                  onPress={magWijzigen ? () => setConcept(conceptVanActiviteit(a)) : undefined}
                  trailing={
                    magAfronden ? (
                      <Pressable
                        onPress={() => afronden(a)}
                        disabled={vinkBezig}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Taak ${a.title ?? ''} afronden`}
                        style={[styles.vink, vinkBezig && { opacity: 0.5 }]}
                      >
                        <Check size={15} color={t.muted} strokeWidth={3} />
                      </Pressable>
                    ) : undefined
                  }
                />
              ))}
            </AppListGroup>
          </>
        )}
      </AppScreen>

      <ActivityFormSheet
        concept={concept}
        klanten={klanten}
        medewerkers={medewerkers}
        toonType={false}
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
    foutBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: t.rMd,
      backgroundColor: t.statusRejectBg,
    },
    foutTekst: { fontSize: 13, fontWeight: '600', color: t.statusRejectFg },
  });
