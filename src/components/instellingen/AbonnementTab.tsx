import { useEffect, useMemo, useState } from 'react';
import { Text, View, Platform } from 'react-native';
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
import { Kaart, Uitleg, stijlVoorInstellingen } from './Bouwstenen';
import { BEHEER_BUITEN_APP, toonAankoopInfo } from '@/lib/aankoopInfo';

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
        <Text style={s.hint}>Abonnement laden…</Text>
      </Kaart>
    );
  }
  if (fout || !stand) {
    return (
      <Kaart titel="Abonnement">
        <Text style={s.hint}>{fout ?? 'Geen abonnementsgegevens gevonden.'}</Text>
      </Kaart>
    );
  }

  const aankoop = toonAankoopInfo();
  const opzeggen = stand.opzeggenPerEindePeriode || stand.stoptNaLooptijd;
  const status =
    (ABONNEMENT_STATUS[stand.status ?? ''] ?? stand.status ?? 'Onbekend') +
    (opzeggen
      ? stand.stoptOp
        ? ` · stopt ${formatDateLongNL(stand.stoptOp)}`
        : ' · stopt per einde periode'
      : '');
  const statusToon =
    stand.status === 'actief' ? 'goed' : stand.status === 'trial' ? 'waarschuwing' : 'fout';

  return (
    <>
      {stand.readonly ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Uitleg toon="waarschuwing">
            {`${readonlyTekst(stand.readonlyReden, Platform.OS).titel}\n${readonlyTekst(stand.readonlyReden, Platform.OS).uitleg}`}
          </Uitleg>
        </View>
      ) : null}

      <Kaart
        titel={pakketLabel(stand.tier)}
        sub={
          aankoop
            ? `€ ${maandbedrag(stand.tier, stand.extraGebruikers)} p/mnd${
                stand.extraGebruikers > 0
                  ? ` (${pakketLabel(stand.tier)} + ${stand.extraGebruikers} × € ${EXTRA_GEBRUIKER_PRIJS})`
                  : ''
              }${stand.billingInterval === 'jaar' ? ' · jaarabonnement' : ''}`
            : 'Huidig pakket'
        }
      >
        <Uitleg toon={statusToon}>{status}</Uitleg>
        {stand.trial && stand.trialEindigtOp ? (
          <Regel label={aankoop ? 'Gratis uitproberen t/m' : 'Proefperiode t/m'} waarde={formatDateLongNL(stand.trialEindigtOp)} s={s} />
        ) : null}
        {stand.verlengtOp ? (
          <Regel
            label={stand.opzeggenPerEindePeriode ? 'Stopt op' : 'Verlengt op'}
            waarde={formatDateLongNL(stand.verlengtOp)}
            s={s}
          />
        ) : null}
      </Kaart>

      {Object.keys(stand.limieten).length > 0 ? (
        <Kaart titel="In gebruik">
          {Object.entries(stand.limieten).map(([k, v]) => {
            const max = v?.max ?? null;
            const gebruikt = Number(v?.gebruikt || 0);
            return (
              <Regel
                key={k}
                label={LIMIET_LABELS[k] ?? k}
                waarde={`${gebruikt}${max == null ? ' · onbeperkt' : ` / ${max}`}`}
                waarschuw={max != null && gebruikt >= max}
                s={s}
              />
            );
          })}
        </Kaart>
      ) : null}

      {aankoop && stand.billingInterval === 'jaar' && stand.welkomstactie ? (
        <Kaart titel="Welkomstactie">
          <Text style={s.lijstTitel}>{WELKOMSTACTIES[stand.welkomstactie]?.label ?? stand.welkomstactie}</Text>
          <Text style={s.hint}>{WELKOMSTACTIES[stand.welkomstactie]?.kort ?? ''}</Text>
          {stand.welkomstactie === 'gratis_website' && stand.websiteAanvraag?.status ? (
            <Text style={s.hint}>
              Status aanvraag: {WEBSITE_STATUS[stand.websiteAanvraag.status] ?? stand.websiteAanvraag.status}
            </Text>
          ) : null}
        </Kaart>
      ) : null}

      {stand.modules.length > 0 ? (
        <Kaart titel="Modules">
          {stand.modules.map((k) => (
            <Regel
              key={k}
              label={MODULES[k]?.label ?? k}
              waarde={aankoop && MODULES[k] ? `€ ${MODULES[k].prijs} p/mnd` : ''}
              s={s}
            />
          ))}
        </Kaart>
      ) : null}

      {aankoop && stand.heeftVerplichting && stand.verplichtingTot ? (
        <Kaart titel="Looptijd">
          <Text style={s.lijstTitel}>Jaarabonnement, loopt t/m {formatDateLongNL(stand.verplichtingTot)}</Text>
          <Text style={s.hint}>
            {stand.stoptNaLooptijd
              ? `Je hebt opgezegd. Het abonnement stopt op ${formatDateLongNL(stand.verplichtingTot)}.`
              : `Tussentijds opzeggen kan niet. Je kunt opzeggen tegen ${formatDateLongNL(stand.verplichtingTot)}; daarna loopt het maandelijks door en is het per maand opzegbaar.`}
          </Text>
        </Kaart>
      ) : null}

      {!aankoop ? (
        <Kaart titel="Beheren">
          {/* iOS (App Store 3.1.1): geen prijzen, geen aankoop- of beheerlink. */}
          <Text style={s.hint}>{BEHEER_BUITEN_APP}</Text>
        </Kaart>
      ) : (
      <Kaart titel="Beheren">
        <Text style={s.hint}>
          {stand.magBeheren
            ? 'Van pakket wisselen, modules bij- of afkopen, opzeggen en je facturen en betaalmethode beheer je op het dashboard.'
            : 'Alleen de eigenaar van het bedrijf kan het abonnement wijzigen of opzeggen.'}
        </Text>
        {!stand.heeftStripe ? (
          <Text style={s.hint}>
            Je bent BossBase nu gratis aan het uitproberen. Er is nog geen betaalmethode gekoppeld.
          </Text>
        ) : null}
        {stand.magBeheren ? (
          <Button
            label="Abonnement beheren op het dashboard"
            variant="secondary"
            onPress={() => openDashboard('instellingen', 'abonnement')}
          />
        ) : null}
      </Kaart>
      )}
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
