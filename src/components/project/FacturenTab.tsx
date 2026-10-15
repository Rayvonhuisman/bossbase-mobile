import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDateNL, formatEUR, formatEURCent } from '@/lib/format';
import type { ProjectCijfers } from '@/lib/projectLogica';
import { factuurStatusLabel } from '@/services/factuurService';
import type { ProjectFactuur } from '@/services/projectService';
import { Blok, KleineKnop, Rij, useStijl, Veld } from './bouwstenen';

/**
 * De Facturen-tab (`FacturenTab` in het dashboard): projectwaarde,
 * gefactureerd en nog te factureren (excl. btw, achter `projectbedragen`),
 * de facturen van dit project en een nieuwe factuur met het project
 * voorgevuld. De tab zelf vraagt het recht `facturen`.
 */
export function FacturenTab({
  projectId,
  klantId,
  projectWaarde,
  cijfers,
  facturen,
  magBedragen,
  magMaken,
}: {
  projectId: string;
  klantId: string | null;
  projectWaarde: number;
  cijfers: ProjectCijfers;
  facturen: ProjectFactuur[];
  magBedragen: boolean;
  magMaken: boolean;
}) {
  const router = useRouter();
  const { t, styles } = useStijl();
  const nieuw = () =>
    router.push(
      `/invoices?nieuw=1&project=${encodeURIComponent(projectId)}${klantId ? `&klant=${encodeURIComponent(klantId)}` : ''}`,
    );

  return (
    <>
      {magBedragen ? (
        <Blok titel="Facturatie">
          <View style={styles.raster}>
            <Veld label="Projectwaarde">
              <Text style={styles.tegelWaarde}>{formatEUR(projectWaarde)}</Text>
            </Veld>
            <Veld label="Gefactureerd">
              <Text style={styles.tegelWaarde}>{formatEUR(cijfers.omzetExclBtw)}</Text>
            </Veld>
            <Veld label="Te factureren">
              <Text style={[styles.tegelWaarde, cijfers.remainingToInvoice > 0 && { color: t.statusWarnFg }]}>
                {formatEUR(cijfers.remainingToInvoice)}
              </Text>
            </Veld>
          </View>
        </Blok>
      ) : null}

      <Blok
        titel={`Facturen (${facturen.length})`}
        actie={magMaken ? <KleineKnop label="Nieuwe factuur" icon="plus" onPress={nieuw} /> : undefined}
      >
        {facturen.length === 0 ? (
          <Text style={styles.leeg}>Nog geen facturen aangemaakt voor dit project.</Text>
        ) : (
          facturen.map((f) => (
            <Rij
              key={f.id}
              titel={f.nummer || 'Factuur'}
              sub={[
                f.factuurdatum ? formatDateNL(f.factuurdatum) : null,
                f.vervaldatum ? `vervalt ${formatDateNL(f.vervaldatum)}` : null,
                factuurStatusLabel(f.status),
              ]
                .filter(Boolean)
                .join(' · ')}
              rechts={<Text style={styles.bedrag}>{formatEURCent(Number(f.totaal_incl ?? 0))}</Text>}
              onPress={() => router.push(`/invoices?id=${encodeURIComponent(f.id)}`)}
            />
          ))
        )}
      </Blok>
    </>
  );
}
