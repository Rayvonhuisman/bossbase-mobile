import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import {
  AppScreen,
  AppSection,
  AppTopBar,
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components';
import { useTheme } from '@/providers';
import { listCompanyPhotos, type CompanyPhoto } from '@/services/workOrderService';
import { formatDateNL } from '@/lib/format';
import { ds, radius, spacing, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Foto's & bestanden — alle werkbonfoto's van het bedrijf, nieuwste eerst.
 *
 * Dit scherm toonde eerder een placeholder met de toelichting dat de bucket
 * `werkbon-photos` nog niet zou bestaan. Die bucket heet `werkbon-fotos` en
 * staat er gewoon, mét de bijbehorende storage-policies; de app schrijft er via
 * het werkbondetail al foto's naartoe. De placeholder was dus verouderd, niet
 * de infrastructuur.
 *
 * De bucket is privé: elke thumbnail loopt via een kortlopende signed URL. De
 * SELECT-policy op `werkbon_fotos` is bedrijfsbreed, terwijl die op `werkbonnen`
 * smaller is — een foto waarvan je de werkbon niet mag openen toont daarom wel
 * de foto en niet de klus.
 */

export default function FilesScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { width } = useWindowDimensions();

  const [items, setItems] = useState<CompanyPhoto[]>([]);  const [error, setError] = useState<string | null>(null);

  // Drie kolommen met marge ertussen; de tegel schaalt mee met het scherm.
  const tegel = Math.floor((width - spacing.lg * 2 - spacing.sm * 2) / 3);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await listCompanyPhotos();
    if (e) setError(e);
    else setItems(data);
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, opnieuw } = useLaden(load, { onFout: setError });



  if (loading) return <LoadingScreen label="Foto's laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={
            <AppTopBar variant="detail" title="Foto's & bestanden" onBack={() => terugOfNaar(router, '/menu')} />
          }
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  // Per werkbon groeperen: zo hoort een reeks foto's van dezelfde klus bij
  // elkaar, in plaats van door de tijd heen uit elkaar te vallen.
  const groepen = new Map<string, { titel: string; sub: string; fotos: CompanyPhoto[] }>();
  for (const f of items) {
    const bestaand = groepen.get(f.werkbon_id);
    if (bestaand) {
      bestaand.fotos.push(f);
      continue;
    }
    const bon = f.werkbon;
    groepen.set(f.werkbon_id, {
      titel: bon?.titel || bon?.nummer || 'Werkbon',
      sub: [bon?.customer?.name, formatDateNL(f.created_at)].filter(Boolean).join(' · '),
      fotos: [f],
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Foto's & bestanden"
            subtitle={`${items.length} ${items.length === 1 ? "foto" : "foto's"} bij ${groepen.size} ${groepen.size === 1 ? 'werkbon' : 'werkbonnen'}`}
            onBack={() => terugOfNaar(router, '/menu')}
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Camera size={40} color={ds.green} strokeWidth={1.6} />}
            title="Nog geen foto's"
            message="Foto's die je op een werkbon vastlegt verschijnen hier. Open een werkbon en tik bij Foto's op Toevoegen."
          />
        ) : (
          [...groepen.entries()].map(([werkbonId, groep]) => (
            <View key={werkbonId}>
              <AppSection title={groep.titel} count={groep.fotos.length} variant="eyebrow" />
              <Text style={styles.groepSub}>{groep.sub}</Text>
              <View style={styles.raster}>
                {groep.fotos.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => router.push(`/work-orders/${werkbonId}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Foto bij ${groep.titel}`}
                    style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                  >
                    <Image
                      source={{ uri: f.url }}
                      style={[styles.foto, { width: tegel, height: tegel }]}
                    />
                    {f.categorie ? (
                      <View style={styles.label}>
                        <Text style={styles.labelTekst}>{f.categorie}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}

        {items.length > 0 ? (
          <Text style={styles.voetnoot}>
            Tik op een foto om de bijbehorende werkbon te openen. Daar kun je foto&rsquo;s
            toevoegen en verwijderen.
          </Text>
        ) : null}
      </AppScreen>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    groepSub: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      marginTop: -spacing.xs,
      fontSize: 12.5,
      color: t.muted,
    },
    raster: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    foto: { borderRadius: radius.md, backgroundColor: t.bgAlt },
    label: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: radius.sm,
      backgroundColor: 'rgba(6, 43, 20, 0.72)',
    },
    labelTekst: { fontSize: 10.5, fontWeight: '700', color: '#FFFFFF' },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
