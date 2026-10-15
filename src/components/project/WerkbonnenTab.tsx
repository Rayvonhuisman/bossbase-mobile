import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StatusBadge } from '@/components';
import { formatDateNL } from '@/lib/format';
import { planRegels, takenVoortgang } from '@/lib/projectLogica';
import { planningLabel, type WerkbonDag } from '@/lib/werkbonLogica';
import type { ProjectWerkbon } from '@/services/projectService';
import { Blok, KleineKnop, useStijl } from './bouwstenen';

/**
 * De Werkbonnen-tab (`WerkbonnenTab` in het dashboard): elke werkbon van dit
 * project met de geplande periode, de takenvoortgang en per dag wie erop
 * staat. Nieuw gaat door hetzelfde werkbonformulier als elders, met klant en
 * project voorgevuld — niet een snelle variant zonder tijden.
 */
export function WerkbonnenTab({
  projectId,
  klantId,
  werkbonnen,
  magMaken,
  naamVan,
}: {
  projectId: string;
  klantId: string | null;
  werkbonnen: ProjectWerkbon[];
  magMaken: boolean;
  naamVan: (id: string) => string | null;
}) {
  const router = useRouter();
  const { t, styles } = useStijl();

  return (
    <Blok
      titel={`Werkbonnen (${werkbonnen.length})`}
      actie={
        magMaken ? (
          <KleineKnop
            label="Nieuwe werkbon"
            icon="plus"
            onPress={() =>
              router.push(
                `/work-orders/new?projectId=${encodeURIComponent(projectId)}${klantId ? `&customerId=${encodeURIComponent(klantId)}` : ''}`,
              )
            }
          />
        ) : undefined
      }
    >
      {werkbonnen.length === 0 ? (
        <Text style={styles.leeg}>Nog geen werkbonnen gekoppeld aan dit project.</Text>
      ) : (
        werkbonnen.map((w) => {
          const taken = takenVoortgang(w.werkbon_taken);
          const dagen = planRegels([w], naamVan);
          // Alleen dagen mét datum; een dag zonder datum is nog niet ingepland.
          const periode = planningLabel({
            ...w,
            werkbon_dagen: (w.werkbon_dagen ?? []).flatMap((d): WerkbonDag[] => (d.datum ? [{ ...d, datum: d.datum }] : [])),
          });
          return (
            <Pressable
              key={w.id}
              onPress={() => router.push(`/work-orders/${w.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Werkbon ${w.titel || ''} openen`}
              style={({ pressed }) => [styles.rij, pressed && { opacity: 0.7 }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.rijTitel} numberOfLines={1}>
                  {w.titel || 'Werkbon'}
                </Text>
                {periode ? <Text style={styles.rijSub}>{periode}</Text> : null}
                {taken.totaal ? (
                  <View style={styles.rijMidden}>
                    <Text style={styles.rijSub}>
                      {taken.klaar}/{taken.totaal} taken
                    </Text>
                    <View style={styles.voortgang}>
                      <View style={[styles.voortgangBalk, { width: `${taken.pct}%` }]} />
                    </View>
                  </View>
                ) : null}
                {dagen.map((d) => (
                  <Text key={d.sleutel} style={styles.rijSub} numberOfLines={1}>
                    {[
                      formatDateNL(d.datum),
                      d.starttijd ? `${d.starttijd}${d.eindtijd ? `–${d.eindtijd}` : ''}` : null,
                      d.wie.join(', ') || null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ))}
              </View>
              <StatusBadge status={w.status ?? 'gepland'} />
              <ChevronRight size={16} color={t.muted2} />
            </Pressable>
          );
        })
      )}
    </Blok>
  );
}
