import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { useTheme } from '@/providers';
import { formatDateLongNL } from '@/lib/format';
import { readonlyTekst } from '@/lib/permissions';
import { openDashboard } from '@/lib/dashboardLink';
import {
  ABONNEMENT_STATUS,
  EXTRA_GEBRUIKER_PRIJS,
  LIMIET_LABELS,
  MODULES,
  WEBSITE_STATUS,
  WELKOMSTACTIES,
  maandbedrag,
  pakketLabel,
} from '@/lib/instellingenRegels';
import { getAbonnement, type AbonnementStand } from '@/services/instellingenService';
import { tx, txn } from '@/i18n';
import { Kaart, Uitleg, stijlVoorInstellingen } from './Bouwstenen';

/**
 * Abonnement — alleen lezen, uit RPC `get_billing_status`, met dezelfde
 * gegevens als `AbonnementSectie` in het dashboard. Wijzigen, opzeggen en
 * facturen/betaalmethode lopen via Stripe (edge functions `billing-*`); dat
 * doet de app niet zelf en verwijst ervoor naar het dashboard.
 */
export function AbonnementTab() {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const [stand, setStand] = useState<AbonnementStand | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    let actief = true;
    getAbonnement().then((r) => {
      if (!actief) return;
      setStand(r.data);
      setFout(r.error);
      setLaden(false);
    });
    return () => {
      actief = false;
    };
  }, []);

  if (laden) {
    return (
      <Kaart>
        <Text style={s.hint}>{tx('Abonnement laden…')}</Text>
      </Kaart>
    );
  }
  if (fout || !stand) {
    return (
      <Kaart titel={tx('Abonnement')}>
        <Text style={s.hint}>{fout ?? tx('Geen abonnementsgegevens gevonden.')}</Text>
      </Kaart>
    );
  }

  const gratis = stand.gratisTotOpzegging;
  const opzeggen = stand.opzeggenPerEindePeriode || stand.stoptNaLooptijd;
  const statusLabel = gratis
    ? tx('Gratis tot opzegging')
    : ABONNEMENT_STATUS[stand.status ?? ''] ?? stand.status ?? tx('Onbekend');
  const status = opzeggen
    ? stand.stoptOp
      ? tx('{status} · stopt {datum}', { status: statusLabel, datum: formatDateLongNL(stand.stoptOp) })
      : tx('{status} · stopt per einde periode', { status: statusLabel })
    : statusLabel;
  const statusToon =
    stand.readonly ? 'fout' : gratis || stand.status === 'actief' ? 'goed' : stand.status === 'trial' ? 'waarschuwing' : 'fout';

  return (
    <>
      {stand.readonly ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Uitleg toon="waarschuwing">
            {`${readonlyTekst(stand.readonlyReden).titel}\n${readonlyTekst(stand.readonlyReden).uitleg}`}
          </Uitleg>
        </View>
      ) : null}

      <Kaart
        titel={pakketLabel(stand.tier)}
        sub={gratis ? tx('€ 0 p/mnd · gratis, zonder einddatum') : `${tx('€ {bedrag} p/mnd', { bedrag: maandbedrag(stand.tier, stand.extraGebruikers) })}${
          stand.extraGebruikers > 0
            ? ` (${pakketLabel(stand.tier)} + ${stand.extraGebruikers} × € ${EXTRA_GEBRUIKER_PRIJS})`
            : ''
        }${stand.billingInterval === 'jaar' ? ` · ${tx('jaarabonnement')}` : ''}`}
      >
        <Uitleg toon={statusToon}>{status}</Uitleg>
        {stand.trial && stand.trialEindigtOp ? (
          <Regel label={tx('Gratis uitproberen t/m')} waarde={formatDateLongNL(stand.trialEindigtOp)} s={s} />
        ) : null}
        {gratis ? (
          <Regel
            label={stand.stoptOp ? tx('Gratis actief t/m') : tx('Gratis actief')}
            waarde={stand.stoptOp ? formatDateLongNL(stand.stoptOp) : tx('tot je opzegt')}
            s={s}
          />
        ) : null}
        {!gratis && stand.verlengtOp ? (
          <Regel
            label={stand.opzeggenPerEindePeriode ? tx('Stopt op') : tx('Verlengt op')}
            waarde={formatDateLongNL(stand.verlengtOp)}
            s={s}
          />
        ) : null}
      </Kaart>

      {Object.keys(stand.limieten).length > 0 ? (
        <Kaart titel={tx('In gebruik')}>
          {Object.entries(stand.limieten).map(([k, v]) => {
            const max = v?.max ?? null;
            const gebruikt = Number(v?.gebruikt || 0);
            return (
              <Regel
                key={k}
                label={LIMIET_LABELS[k] ?? k}
                waarde={max == null ? tx('{n} · onbeperkt', { n: gebruikt }) : `${gebruikt} / ${max}`}
                waarschuw={max != null && gebruikt >= max}
                s={s}
              />
            );
          })}
          {/* Zelfde uitleg als het dashboard: de teller telt uitnodigingen mee
              (pakketlimiet), het bedrag niet (G-22). */}
          {stand.gebruikers && stand.gebruikers.uitgenodigd > 0 ? (
            <Text style={s.hint}>
              {txn(
                '{actief} actief en {n} openstaande uitnodiging. Een uitnodiging telt mee voor het maximum van je pakket, maar je betaalt pas voor iemand als hij de uitnodiging heeft geaccepteerd.',
                '{actief} actief en {n} openstaande uitnodigingen. Een uitnodiging telt mee voor het maximum van je pakket, maar je betaalt pas voor iemand als hij de uitnodiging heeft geaccepteerd.',
                stand.gebruikers.uitgenodigd,
                { actief: stand.gebruikers.actief },
              )}
            </Text>
          ) : null}
        </Kaart>
      ) : null}

      {stand.billingInterval === 'jaar' && stand.welkomstactie ? (
        <Kaart titel={tx('Welkomstactie')}>
          <Text style={s.lijstTitel}>{WELKOMSTACTIES[stand.welkomstactie]?.label ?? stand.welkomstactie}</Text>
          <Text style={s.hint}>{WELKOMSTACTIES[stand.welkomstactie]?.kort ?? ''}</Text>
          {stand.welkomstactie === 'gratis_website' && stand.websiteAanvraag?.status ? (
            <Text style={s.hint}>
              {tx('Status aanvraag: {status}', {
                status: WEBSITE_STATUS[stand.websiteAanvraag.status] ?? stand.websiteAanvraag.status,
              })}
            </Text>
          ) : null}
        </Kaart>
      ) : null}

      {stand.modules.length > 0 ? (
        <Kaart titel={tx('Modules')}>
          {stand.modules.map((k) => (
            <Regel
              key={k}
              label={MODULES[k]?.label ?? k}
              waarde={MODULES[k] ? tx('€ {bedrag} p/mnd', { bedrag: MODULES[k].prijs }) : ''}
              s={s}
            />
          ))}
        </Kaart>
      ) : null}

      {stand.heeftVerplichting && stand.verplichtingTot ? (
        <Kaart titel={tx('Looptijd')}>
          <Text style={s.lijstTitel}>{tx('Jaarabonnement, loopt t/m {datum}', { datum: formatDateLongNL(stand.verplichtingTot) })}</Text>
          <Text style={s.hint}>
            {stand.stoptNaLooptijd
              ? tx('Je hebt opgezegd. Het abonnement stopt op {datum}.', { datum: formatDateLongNL(stand.verplichtingTot) })
              : tx('Tussentijds opzeggen kan niet. Je kunt opzeggen tegen {datum}; daarna loopt het maandelijks door en is het per maand opzegbaar.', { datum: formatDateLongNL(stand.verplichtingTot) })}
          </Text>
        </Kaart>
      ) : null}

      <Kaart titel={tx('Beheren')}>
        <Text style={s.hint}>
          {stand.magBeheren
            ? tx('Van pakket wisselen, modules bij- of afkopen, opzeggen en je facturen en betaalmethode beheer je op het dashboard.')
            : tx('Alleen de eigenaar van het bedrijf kan het abonnement wijzigen of opzeggen.')}
        </Text>
        {gratis ? (
          <Text style={s.hint} testID="gratis-tot-opzegging">
            {stand.stoptOp
              ? tx('Je hebt opgezegd. Je account blijft gratis actief tot en met {datum}; tot dan kun je de opzegging op het dashboard intrekken.', { datum: formatDateLongNL(stand.stoptOp) })
              : tx('Je account is gratis actief tot je opzegt. Er is geen betaalmethode nodig en je betaalt geen abonnementskosten. Opzeggen doe je op het dashboard.')}
          </Text>
        ) : !stand.heeftStripe ? (
          <Text style={s.hint}>
            {stand.trial
              ? tx('Je bent BossBase nu gratis aan het uitproberen. Er is nog geen betaalmethode gekoppeld.')
              : tx('Er is geen betaalmethode gekoppeld.')}
          </Text>
        ) : null}
        {stand.magBeheren ? (
          <Button
            label={tx('Abonnement beheren op het dashboard')}
            variant="secondary"
            onPress={() => openDashboard('instellingen', 'abonnement')}
          />
        ) : null}
      </Kaart>
    </>
  );
}

function Regel({
  label,
  waarde,
  waarschuw,
  s,
}: {
  label: string;
  waarde: string;
  waarschuw?: boolean;
  s: ReturnType<typeof stijlVoorInstellingen>;
}) {
  const { colors: t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={s.hint}>{label}</Text>
      <Text style={[s.lijstTitel, { fontSize: 14 }, waarschuw && { color: t.statusWarnFg }]}>{waarde}</Text>
    </View>
  );
}
