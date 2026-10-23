import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { AppSection } from '@/components/AppSection';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { useTheme } from '@/providers';
import { useSchermklasse } from '@/lib/schermklasse';
import { formatDateNL } from '@/lib/format';
import { listCompanyPhotos, type CompanyPhoto } from '@/services/workOrderService';
import { ds, radius, spacing, type ThemeColors } from '@/theme';

/**
 * Foto's & bestanden — de werkbonfoto's van het bedrijf, nieuwste eerst,
 * gegroepeerd per werkbon. Dit was het losse scherm `/files`; het staat nu op
 * de Database-pagina.
 *
 * De bucket `werkbon-fotos` is privé: elke tegel loopt via een kortlopende
 * signed URL. Werkbonfoto's volgen de rechten van hun werkbon, in de tabel én in
 * de opslag (migratie 20261023161512 in ~/BossBase): je ziet hier alleen foto's
 * van werkbonnen die je mag openen. Admins, het recht planning of alles inzien
 * en de gedeelde werkruimte (Starter/Groei) zien dus alles.
 */
export function FotoOverzicht() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { kolomBreedte } = useSchermklasse();
  const [items, setItems] = useState<CompanyPhoto[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);

  const kolommen = kolomBreedte >= 700 ? 5 : 3;
  const tegel = Math.floor((kolomBreedte - spacing.lg * 2 - spacing.sm * (kolommen - 1)) / kolommen);

  const verwerk = useCallback((r: Awaited<ReturnType<typeof listCompanyPhotos>>) => {
    setFout(r.error);
    if (!r.error) setItems(r.data);
    setLaden(false);
  }, []);
  const laad = useCallback(async () => verwerk(await listCompanyPhotos()), [verwerk]);

  // Opnieuw laden (trekken) gebeurt via een nieuwe `key` vanuit het scherm.
  useEffect(() => {
    let actief = true;
    listCompanyPhotos().then((r) => actief && verwerk(r));
    return () => {
      actief = false;
    };
  }, [verwerk]);

  if (laden) {
    return <Text style={styles.voetnoot}>Foto&rsquo;s laden…</Text>;
  }
  if (fout) {
    return <ErrorState title="Niet geladen" message={fout} onRetry={laad} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Camera size={40} color={ds.green} strokeWidth={1.6} />}
        title="Nog geen foto's"
        message="Foto's die je op een werkbon vastlegt verschijnen hier. Open een werkbon en tik bij Foto's op Toevoegen."
      />
    );
  }

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
    <>
      {[...groepen.entries()].map(([werkbonId, groep]) => (
        <View key={werkbonId}>
          <AppSection title={groep.titel} count={groep.fotos.length} variant="eyebrow" />
          {groep.sub ? <Text style={styles.groepSub}>{groep.sub}</Text> : null}
          <View style={styles.raster}>
            {groep.fotos.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => router.push(`/work-orders/${werkbonId}`)}
                accessibilityRole="button"
                accessibilityLabel={`Foto bij ${groep.titel}`}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              >
                <Image source={{ uri: f.url }} style={[styles.foto, { width: tegel, height: tegel }]} />
                {f.categorie ? (
                  <View style={styles.label}>
                    <Text style={styles.labelTekst}>{f.categorie}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Text style={styles.voetnoot}>
        Tik op een foto om de bijbehorende werkbon te openen. Daar kun je foto&rsquo;s toevoegen en
        verwijderen.
      </Text>
    </>
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
      backgroundColor: 'rgba(13, 13, 13, 0.72)',
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
