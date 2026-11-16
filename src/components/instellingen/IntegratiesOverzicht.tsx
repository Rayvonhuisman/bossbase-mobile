import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { CreditCard, Landmark } from 'lucide-react-native';
import { AppListGroup, AppListItem } from '@/components/AppListItem';
import { Button } from '@/components/Button';
import { usePermissions, useTheme } from '@/providers';
import { formatDateNL } from '@/lib/format';
import { openDashboard } from '@/lib/dashboardLink';
import { radius, spacing } from '@/theme';
import {
  getIntegratieStand,
  stripeLabel,
  type IntegratieStand,
} from '@/services/integrationService';
import { Kaart, Uitleg, stijlVoorInstellingen } from './Bouwstenen';
import { tx } from '@/i18n';

const STRIPE_LABEL: Record<ReturnType<typeof stripeLabel>, () => string> = {
  Actief: () => tx('Actief'),
  'In verificatie': () => tx('In verificatie'),
  'Niet gekoppeld': () => tx('Niet gekoppeld'),
};

type Pil = { tekst: string; toon: 'aan' | 'neutraal' | 'binnenkort' };

/**
 * Integraties — alleen de status, zoals de kaarten in het dashboard:
 *
 * - Moneybird: `get_accounting_status` (Actief / Niet gekoppeld), pakket-gate
 *   `boekhoudkoppeling` ("Vanaf Groei").
 * - SnelStart en AFAS: "Binnenkort beschikbaar".
 * - Stripe: `stripe_connections` (Actief / In verificatie / Niet gekoppeld),
 *   pakket-gate `stripe_betaallink` ("Vanaf Team").
 *
 * Koppelen, ontkoppelen en synchroniseren doe je op het dashboard; de app
 * verwijst daarheen in plaats van een half werkende flow te tonen.
 */
export function IntegratiesOverzicht() {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const { hasFeature } = usePermissions();
  const [stand, setStand] = useState<IntegratieStand | null>(null);

  useEffect(() => {
    let actief = true;
    getIntegratieStand().then((r) => actief && setStand(r));
    return () => {
      actief = false;
    };
  }, []);

  const pil = (p: Pil) => {
    const kleur =
      p.toon === 'aan'
        ? { bg: t.statusApproveBg, fg: t.statusApproveFg }
        : p.toon === 'binnenkort'
          ? { bg: t.statusInfoBg, fg: t.statusInfoFg }
          : { bg: t.statusDraftBg, fg: t.statusDraftFg };
    return (
      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: kleur.bg }}>
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: kleur.fg }}>{p.tekst}</Text>
      </View>
    );
  };

  if (!stand) {
    return (
      <Kaart>
        <Text style={s.hint}>{tx('Koppelingen laden…')}</Text>
      </Kaart>
    );
  }

  const boekhoudGate = !hasFeature('boekhoudkoppeling');
  const stripeGate = !hasFeature('stripe_betaallink');
  const mb = stand.boekhouding.find((b) => b.provider === 'moneybird');
  const mbAan = mb?.connected === true;
  const stripeTekst = stripeLabel(stand.stripe);

  return (
    <>
      {stand.fouten.map((f) => (
        <View key={f} style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
          <Uitleg toon="waarschuwing">{f}</Uitleg>
        </View>
      ))}

      <View style={{ marginTop: spacing.md }}>
        <AppListGroup>
          <AppListItem
            first
            icon={Landmark}
            title="Moneybird"
            subtitle={
              boekhoudGate
                ? tx('Facturen automatisch naar je boekhouding horen bij Groei.')
                : mbAan
                  ? mb?.lastSyncedAt
                    ? tx('Laatst gesynchroniseerd {datum}', { datum: formatDateNL(mb.lastSyncedAt) })
                    : tx('Synchroniseer facturen automatisch naar Moneybird.')
                  : tx('Synchroniseer facturen automatisch naar Moneybird en importeer inkoopfacturen als kostenregels.')
            }
            trailing={pil(
              boekhoudGate
                ? { tekst: tx('Vanaf Groei'), toon: 'neutraal' }
                : { tekst: mbAan ? tx('Actief') : tx('Niet gekoppeld'), toon: mbAan ? 'aan' : 'neutraal' },
            )}
          />
          <AppListItem
            icon={Landmark}
            title="SnelStart"
            subtitle={tx('Boek facturen automatisch als verkoopboeking in SnelStart en synchroniseer klanten.')}
            trailing={pil({ tekst: tx('Binnenkort beschikbaar'), toon: 'binnenkort' })}
          />
          <AppListItem
            icon={Landmark}
            title="AFAS"
            subtitle={tx('Koppel je AFAS administratie met BossBase.')}
            trailing={pil({ tekst: tx('Binnenkort beschikbaar'), toon: 'binnenkort' })}
          />
          <AppListItem
            icon={CreditCard}
            title="Stripe"
            subtitle={
              stripeGate
                ? tx('Online betalen van facturen hoort bij Team, of als module bij Groei.')
                : tx('Laat klanten je facturen online betalen.')
            }
            trailing={pil(
              stripeGate
                ? { tekst: tx('Vanaf Team'), toon: 'neutraal' }
                : { tekst: STRIPE_LABEL[stripeTekst](), toon: stripeTekst === 'Actief' ? 'aan' : 'neutraal' },
            )}
          />
        </AppListGroup>
      </View>

      <Kaart>
        <Text style={s.hint}>
          {tx('Koppelen, ontkoppelen en synchroniseren doe je op het dashboard. De app toont alleen of een koppeling actief is.')}
        </Text>
        <Button
          label={tx('Koppelingen beheren op het dashboard')}
          variant="secondary"
          onPress={() => openDashboard('instellingen', 'integraties')}
        />
      </Kaart>
    </>
  );
}
