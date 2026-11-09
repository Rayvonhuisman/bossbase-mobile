import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppTopBar,
  ErrorState,
  LoadingScreen,
  OnderStatusbalk,
  PermissionGate,
} from '@/components';
import { GegevensRij, KaartBlok, KaartLeeg, KaartPil, KaartRij } from '@/components/RelatieKaart';
import { useTheme } from '@/providers';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { formatDateNL, formatEUR } from '@/lib/format';
import { alsTekst } from '@/lib/notitieTekst';
import { leesbreedte } from '@/lib/schermklasseRegels';
import { PRIORITEITEN, PRIORITEIT_LABEL } from '@/lib/sla';
import {
  CONTRACT_STATUS_LABEL,
  FACTUUR_RITME_LABEL,
  getContract,
  installatieNaam,
  intervalLabel,
  type ContractDetail,
} from '@/services/contractService';

/**
 * Eén onderhoudscontract, alleen-lezen. De app beheert geen contracten (dat
 * gebeurt in het dashboard); dit scherm is er voor de klantkaart en voor de
 * meldingen contract_afloop en contract_ondertekend (link `contracten/<id>`).
 *
 * Recht `contracten` en de feature contracten, net als de Contracten-pagina
 * van het dashboard. Wie het recht heeft ziet het hele contract, ook de prijs
 * (bouwtekening: "wie contracten heeft ziet het hele contract").
 */
export default function ContractScherm() {
  return (
    <PermissionGate permission="contracten" feature="contracten" label="Contracten" fallback="/customers">
      <ContractInhoud />
    </PermissionGate>
  );
}

function uren(v: number | null | undefined): string {
  return v == null ? '—' : `${String(v).replace('.', ',')} u`;
}

function ContractInhoud() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: th } = useTheme();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async () => {
    if (!id) return;
    const r = await getContract(id);
    setFout(r.error ?? (r.data ? null : 'Dit contract bestaat niet of je hebt er geen toegang toe.'));
    if (r.data) setContract(r.data);
  }, [id]);
  const { loading, refreshing, onRefresh, opnieuw } = useLaden(laad, { onFout: setFout });

  const terug = () => terugOfNaar(router, contract?.customer_id ? `/customers/${contract.customer_id}` : '/customers');

  if (loading && !contract) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <AppTopBar variant="detail" title="Contract" onBack={terug} />
          <LoadingScreen label="Contract laden..." />
        </View>
      </>
    );
  }
  if (!contract) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <AppTopBar variant="detail" title="Contract" onBack={terug} />
          <ErrorState title="Contract niet gevonden" message={fout ?? 'Onbekende fout.'} onRetry={opnieuw} />
        </View>
      </>
    );
  }

  const c = contract;
  const adres = [c.adres, [c.postcode, c.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const looptijd = `${formatDateNL(c.startdatum)} – ${c.einddatum ? formatDateNL(c.einddatum) : 'onbepaalde tijd'}`;
  const verlengen = c.stilzwijgend_verlengen
    ? `Stilzwijgend, telkens ${c.verleng_maanden ?? 12} maanden`
    : 'Niet stilzwijgend';
  const prijs =
    c.prijs_excl != null
      ? `${formatEUR(Number(c.prijs_excl))} excl. btw${c.factuur_ritme ? ` ${FACTUUR_RITME_LABEL[c.factuur_ritme] ?? ''}` : ''}`
      : 'Geen vast bedrag';
  const binnen = alsTekst(c.binnen_contract ?? '').trim();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <OnderStatusbalk>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 40 }}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.green} colors={[th.green]} />
            }
          >
            <AppTopBar
              variant="detail"
              onBack={terug}
              eyebrow={c.nummer ?? 'Contract'}
              title={c.titel}
              subtitle={c.customer?.name ?? undefined}
              rightAction={
                <KaartPil
                  tekst={CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                  toon={c.status === 'actief' ? 'goed' : c.status === 'opgezegd' ? 'let-op' : 'neutraal'}
                />
              }
            />
            <View style={leesbreedte}>
              <KaartBlok titel="Gegevens">
                {c.customer ? (
                  <GegevensRij
                    eerste
                    label="Klant"
                    waarde={c.customer.name}
                    onPress={() => router.push(`/customers/${c.customer!.id}`)}
                  />
                ) : null}
                {adres ? <GegevensRij eerste={!c.customer} label="Adres" waarde={adres} /> : null}
                <GegevensRij eerste={!c.customer && !adres} label="Looptijd" waarde={looptijd} />
                {c.einddatum ? <GegevensRij label="Verlengen" waarde={verlengen} /> : null}
                {c.opzegtermijn_dagen != null ? (
                  <GegevensRij label="Opzegtermijn" waarde={`${c.opzegtermijn_dagen} dagen`} />
                ) : null}
                {c.opgezegd_op ? <GegevensRij label="Opgezegd op" waarde={formatDateNL(c.opgezegd_op)} /> : null}
                <GegevensRij label="Prijs" waarde={prijs} />
                {c.ondertekend_op ? (
                  <GegevensRij
                    label="Ondertekend"
                    waarde={`${formatDateNL(c.ondertekend_op)}${c.ondertekend_door_naam ? ` door ${c.ondertekend_door_naam}` : ''}`}
                  />
                ) : null}
              </KaartBlok>

              <KaartBlok titel="Onderhoudsbeurten" aantal={c.beurten.length}>
                {c.beurten.length === 0 ? (
                  <KaartLeeg tekst="Geen vaste beurten in dit contract." />
                ) : (
                  c.beurten.map((b, i) => (
                    <KaartRij
                      key={b.id}
                      eerste={i === 0}
                      gedimd={!b.actief}
                      titel={b.omschrijving}
                      sub={[
                        intervalLabel(b.interval_aantal, b.interval_eenheid),
                        b.volgende_op ? `volgende ${formatDateNL(b.volgende_op)}` : null,
                        b.actief ? null : 'gestopt',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))
                )}
              </KaartBlok>

              {c.sla ? (
                <KaartBlok titel={`SLA ${c.sla.naam}`}>
                  <GegevensRij
                    eerste
                    label="Klok"
                    waarde={c.sla.klok === 'altijd' ? 'Altijd (24/7)' : 'Werkuren (ma–vr 8–17, zonder feestdagen)'}
                  />
                  {PRIORITEITEN.map((p) => (
                    <GegevensRij
                      key={p}
                      label={PRIORITEIT_LABEL[p]}
                      waarde={`reageren ${uren(c.sla![`reactie_${p}_uren`])} · oplossen ${uren(c.sla![`oplos_${p}_uren`])}`}
                    />
                  ))}
                </KaartBlok>
              ) : null}

              <KaartBlok titel="Installaties" aantal={c.installaties.length}>
                {c.installaties.length === 0 ? (
                  <KaartLeeg tekst="Geen installaties aan dit contract gekoppeld." />
                ) : (
                  c.installaties.map((ins, i) => (
                    <KaartRij
                      key={ins.id}
                      eerste={i === 0}
                      titel={installatieNaam(ins)}
                      sub={[ins.serienummer ? `Serienr. ${ins.serienummer}` : null, ins.plaats].filter(Boolean).join(' · ')}
                    />
                  ))
                )}
              </KaartBlok>

              {binnen ? (
                <KaartBlok titel="Binnen het contract">
                  <Text style={{ padding: 14, fontSize: 14, lineHeight: 20, color: th.ink }}>{binnen}</Text>
                </KaartBlok>
              ) : null}

              <Text style={{ paddingHorizontal: 20, paddingTop: 8, fontSize: 12.5, lineHeight: 18, color: th.muted }}>
                Contracten wijzigen, versturen en laten ondertekenen doe je in het dashboard.
              </Text>
            </View>
          </ScrollView>
        </OnderStatusbalk>
      </View>
    </>
  );
}
