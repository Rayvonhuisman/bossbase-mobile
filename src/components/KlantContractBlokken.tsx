import { useCallback, useEffect, useState } from 'react';
import { DateField } from '@/components/DateField';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { KaartBlok, KaartLeeg, KaartPil, KaartRij } from '@/components/RelatieKaart';
import { useRouter } from 'expo-router';
import { usePermissions } from '@/providers';
import { formatDateNL } from '@/lib/format';
import {
  CONTRACT_STATUS_LABEL,
  createInstallatie,
  installatieNaam,
  listInstallaties,
  listKlantContracten,
  type Installatie,
  type InstallatieInvoer,
  type KlantContract,
} from '@/services/contractService';

/**
 * Contracten en installaties op de klantkaart (onderhoudscontracten,
 * 09-11-2026). Alleen-lezen voor contracten; installaties kun je toevoegen.
 *
 *   Contracten   — recht `contracten` (admin altijd) + feature contracten.
 *                  Tik → het alleen-lezen contractscherm.
 *   Installaties — zien mag het hele bedrijf (geen prijzen); toevoegen admin,
 *                  `contracten` of `klanten_bewerken`, met de feature en een
 *                  account dat mag schrijven (zelfde als de RLS-policy).
 */
export function KlantContractBlokken({ klantId, ververs }: { klantId: string; ververs?: number }) {
  const router = useRouter();
  const { loaded, can, hasFeature, readonly } = usePermissions();
  const feature = loaded && hasFeature('contracten');
  const magContracten = feature && can('contracten');
  const magInstallatieToevoegen =
    feature && !readonly && (can('contracten') || can('klanten_bewerken'));

  const [contracten, setContracten] = useState<KlantContract[]>([]);
  const [installaties, setInstallaties] = useState<Installatie[]>([]);
  const [invoer, setInvoer] = useState<InstallatieInvoer | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async () => {
    if (!loaded) return;
    const [c, i] = await Promise.all([
      magContracten ? listKlantContracten(klantId) : Promise.resolve({ data: [], error: null }),
      listInstallaties(klantId),
    ]);
    // Bijzaak op de klantkaart: mislukt het, dan blijft de vorige stand staan.
    if (!c.error) setContracten(c.data);
    if (!i.error) setInstallaties(i.data);
  }, [loaded, magContracten, klantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- laden na een asynchrone query
    void laad();
  }, [laad, ververs]);

  const opslaan = async () => {
    if (!invoer) return;
    setBezig(true);
    setFout(null);
    const r = await createInstallatie(invoer);
    setBezig(false);
    if (r.error) {
      setFout(r.error);
      return;
    }
    setInvoer(null);
    void laad();
  };

  const toonInstallaties = feature || installaties.length > 0;

  return (
    <>
      {magContracten ? (
        <KaartBlok titel="Contracten" aantal={contracten.length}>
          {contracten.length === 0 ? (
            <KaartLeeg tekst="Geen contracten met deze klant. Contracten maak je in het dashboard." />
          ) : (
            contracten.map((c, i) => (
              <KaartRij
                key={c.id}
                eerste={i === 0}
                titel={[c.nummer, c.titel].filter(Boolean).join(' · ')}
                sub={
                  c.volgende_beurt
                    ? `Volgende beurt ${formatDateNL(c.volgende_beurt)}`
                    : c.einddatum
                      ? `Tot ${formatDateNL(c.einddatum)}`
                      : null
                }
                rechts={
                  <KaartPil
                    tekst={CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                    toon={c.status === 'actief' ? 'goed' : c.status === 'opgezegd' ? 'let-op' : 'neutraal'}
                  />
                }
                onPress={() => router.push(`/customers/contract/${c.id}`)}
              />
            ))
          )}
        </KaartBlok>
      ) : null}

      {toonInstallaties ? (
        <KaartBlok
          titel="Installaties"
          aantal={installaties.length}
          onToevoegen={
            magInstallatieToevoegen
              ? () => {
                  setFout(null);
                  setInvoer({
                    customer_id: klantId,
                    soort: '',
                    merk: '',
                    type: '',
                    serienummer: '',
                    plaatsingsdatum: null,
                    notities: '',
                  });
                }
              : undefined
          }
          toevoegLabel="Installatie toevoegen"
        >
          {installaties.length === 0 ? (
            <KaartLeeg tekst="Nog geen installaties bij deze klant." />
          ) : (
            installaties.map((ins, i) => (
              <KaartRij
                key={ins.id}
                eerste={i === 0}
                gedimd={!ins.actief}
                titel={installatieNaam(ins)}
                sub={[
                  ins.serienummer ? `Serienr. ${ins.serienummer}` : null,
                  ins.plaatsingsdatum ? `geplaatst ${formatDateNL(ins.plaatsingsdatum)}` : null,
                  [ins.adres, ins.plaats].filter(Boolean).join(', ') || null,
                  ins.actief ? null : 'niet meer actief',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))
          )}
        </KaartBlok>
      ) : null}

      <FormSheet
        visible={!!invoer}
        title="Installatie toevoegen"
        subtitle="Het adres wordt dat van de klant."
        error={fout}
        saving={bezig}
        submitLabel="Toevoegen"
        submitDisabled={!invoer?.soort.trim()}
        onSubmit={() => void opslaan()}
        onClose={() => setInvoer(null)}
      >
        {invoer ? (
          <>
            <FormField
              label="Soort *"
              value={invoer.soort}
              onChangeText={(v) => setInvoer({ ...invoer, soort: v })}
              placeholder="Bijvoorbeeld cv-ketel, warmtepomp, airco"
            />
            <FormField
              label="Merk"
              value={invoer.merk}
              onChangeText={(v) => setInvoer({ ...invoer, merk: v })}
            />
            <FormField
              label="Type"
              value={invoer.type}
              onChangeText={(v) => setInvoer({ ...invoer, type: v })}
            />
            <FormField
              label="Serienummer"
              value={invoer.serienummer}
              onChangeText={(v) => setInvoer({ ...invoer, serienummer: v })}
              autoCapitalize="characters"
            />
            <DateField
              label="Plaatsingsdatum"
              value={invoer.plaatsingsdatum}
              onChange={(v) => setInvoer({ ...invoer, plaatsingsdatum: v || null })}
            />
            <FormField
              label="Notities"
              value={invoer.notities}
              onChangeText={(v) => setInvoer({ ...invoer, notities: v })}
              multiline
            />
          </>
        ) : null}
      </FormSheet>
    </>
  );
}
