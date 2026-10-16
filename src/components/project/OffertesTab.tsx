import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, FormSheet, SelectField, type SelectOption } from '@/components';
import { PdfWeergave, type PdfDocument } from '@/components/PdfWeergave';
import { formatDateNL, formatEURCent } from '@/lib/format';
import { formatUren } from '@/lib/projectLogica';
import { alsTekst } from '@/lib/notitieTekst';
import { useSave } from '@/lib/useSave';
import { OFFERTE_STATUS } from '@/services/offerteService';
import { listKoppelbareOffertes, type ProjectOfferte, type ProjectRow } from '@/services/projectService';
import type { WriteResult } from '@/lib/writeResult';
import { Blok, useStijl, Veld } from './bouwstenen';

/**
 * De Offertes-tab (`OfferteTab` in het dashboard): de offerte die aan dit
 * project is gekoppeld (`projects.offerte_id`). Zonder koppeling: een nieuwe
 * maken (die daarna meteen gekoppeld wordt) of een bestaande van deze klant
 * kiezen. Met koppeling: de kerngegevens, openen, de PDF en een factuur maken.
 *
 * De tab vraagt het recht `offertes`; nieuw en koppelen bovendien
 * `projecten_bewerken` (canManage van het dashboard).
 */
export function OffertesTab({
  project,
  offertes,
  magBeheren,
  magOfferteMaken,
  magFactuurMaken,
  onKoppel,
}: {
  project: ProjectRow;
  offertes: ProjectOfferte[];
  magBeheren: boolean;
  magOfferteMaken: boolean;
  magFactuurMaken: boolean;
  onKoppel: (offerteId: string) => Promise<WriteResult<unknown>>;
}) {
  const router = useRouter();
  const { styles } = useStijl();
  const [kiezen, setKiezen] = useState(false);
  const [keuze, setKeuze] = useState<string | null>(null);
  const [opties, setOpties] = useState<SelectOption[]>([]);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const { save, saving, error, setError } = useSave<unknown>();

  const gekoppeld = project.offerte_id ? (offertes.find((o) => o.id === project.offerte_id) ?? null) : null;
  const klant = project.customer_id;

  const nieuweOfferte = () =>
    router.push(
      `/offers?nieuw=1&koppel=1&project=${encodeURIComponent(project.id)}${klant ? `&klant=${encodeURIComponent(klant)}` : ''}`,
    );
  const factuurMaken = () =>
    router.push(
      `/invoices?nieuw=1&project=${encodeURIComponent(project.id)}${klant ? `&klant=${encodeURIComponent(klant)}` : ''}`,
    );

  const openKiezen = async () => {
    setError(null);
    setKeuze(null);
    setKiezen(true);
    const r = await listKoppelbareOffertes(klant);
    setLaadFout(r.error);
    setOpties(
      r.data.map((o) => ({
        id: o.id,
        label: `${o.nummer || 'Offerte'}${o.omschrijving ? ` · ${alsTekst(o.omschrijving).slice(0, 40)}` : ''}`,
        sub: `${formatEURCent(Number(o.totaal_incl ?? 0))} · ${OFFERTE_STATUS[o.status ?? ''] ?? o.status ?? ''}`,
      })),
    );
  };

  const koppel = () => {
    if (!keuze) return;
    save(() => onKoppel(keuze), { onSuccess: () => setKiezen(false), succesMelding: 'Offerte gekoppeld' });
  };

  const kiesSheet = (
    <FormSheet
      visible={kiezen}
      title="Bestaande offerte koppelen"
      subtitle={project.name ?? undefined}
      error={error ?? laadFout}
      saving={saving}
      submitLabel="Koppel"
      submitDisabled={!keuze}
      onSubmit={koppel}
      onClose={() => setKiezen(false)}
    >
      <SelectField
        label="Offerte"
        value={keuze}
        options={opties}
        onChange={setKeuze}
        placeholder={opties.length ? 'Kies een offerte' : 'Geen offertes gevonden'}
        searchable
      />
    </FormSheet>
  );

  if (!gekoppeld) {
    return (
      <>
        <Blok titel="Nog geen offerte gekoppeld">
          <Text style={styles.tekst}>
            Koppel een bestaande offerte zodat waarde, uren en facturatie automatisch worden gesynchroniseerd.
          </Text>
          {magBeheren ? (
            <View style={styles.knoppen}>
              {magOfferteMaken ? <Button label="Nieuwe offerte" onPress={nieuweOfferte} /> : null}
              <Button label="Bestaande koppelen" variant="secondary" onPress={openKiezen} />
            </View>
          ) : null}
        </Blok>
        {kiesSheet}
      </>
    );
  }

  return (
    <>
      <Blok titel={gekoppeld.omschrijving ? alsTekst(gekoppeld.omschrijving) : project.name || 'Offerte'}>
        <Text style={styles.klein}>
          {[gekoppeld.nummer, OFFERTE_STATUS[gekoppeld.status ?? ''] ?? gekoppeld.status].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.raster}>
          <Veld label="Offertebedrag (incl.)">
            <Text style={styles.waarde}>{formatEURCent(Number(gekoppeld.totaal_incl ?? 0))}</Text>
          </Veld>
          <Veld label="Begrote uren">
            <Text style={styles.waarde}>{formatUren(gekoppeld.arbeidsuren)}</Text>
          </Veld>
          <Veld label="Geldig tot">
            <Text style={styles.waarde}>{gekoppeld.geldig_tot ? formatDateNL(gekoppeld.geldig_tot) : '—'}</Text>
          </Veld>
          <Veld label="Geaccepteerd">
            <Text style={styles.waarde}>
              {gekoppeld.geaccepteerd_op ? formatDateNL(gekoppeld.geaccepteerd_op.slice(0, 10)) : '—'}
            </Text>
          </Veld>
        </View>
        <View style={styles.knoppen}>
          <Button
            label="Open offerte"
            variant="secondary"
            onPress={() => router.push(`/offers?id=${encodeURIComponent(gekoppeld.id)}`)}
          />
          <Button
            label="PDF bekijken"
            variant="secondary"
            onPress={() =>
              setPdf({ soort: 'offerte', id: gekoppeld.id, titel: `Offerte ${gekoppeld.nummer ?? ''}`.trim(), opgeslagenEerst: false })
            }
          />
          {magFactuurMaken ? <Button label="Factuur maken" variant="secondary" onPress={factuurMaken} /> : null}
          {magBeheren && magOfferteMaken ? (
            <Button label="Nieuwe offerte" variant="ghost" onPress={nieuweOfferte} />
          ) : null}
        </View>
      </Blok>
      <PdfWeergave document={pdf} onSluit={() => setPdf(null)} />
      {kiesSheet}
    </>
  );
}
