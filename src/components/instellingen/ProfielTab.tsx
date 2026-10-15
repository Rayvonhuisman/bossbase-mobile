import { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { openExtern } from '@/lib/linking';
import { Check, X } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { useAuth, useTheme } from '@/providers';
import { Dialog } from '@/lib/dialog';
import { useSave } from '@/lib/useSave';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { WACHTWOORD_REGELS, wachtwoordGeldig } from '@/lib/instellingenRegels';
import { openDashboard } from '@/lib/dashboardLink';
import {
  deactiveerEigenAccount,
  updateEigenProfiel,
  uploadEigenAvatar,
  verwijderEigenAvatar,
  wijzigWachtwoordMetHuidig,
} from '@/services/profileService';
import { getEigenaarId } from '@/services/teamService';
import { spacing } from '@/theme';
import { Gegeven, Kaart, Uitleg, stijlVoorInstellingen } from './Bouwstenen';
import { kiesAfbeelding } from './kiesAfbeelding';

const ROL: Record<string, string> = { admin: 'Admin', planner: 'Planner', medewerker: 'Medewerker' };

/**
 * Mijn profiel — voor iedereen, zoals de tab `profiel` in het dashboard:
 * profielfoto, naam, e-mail (alleen lezen), rol (alleen lezen), wachtwoord
 * wijzigen (met het huidige wachtwoord) en de Gevarenzone.
 *
 * Gevarenzone: een teamlid kan zijn eigen account deactiveren (RPC
 * `delete_own_account`). De eigenaar sluit met "Bedrijf sluiten" het hele
 * bedrijf én zegt het abonnement op (edge function `billing-cancel`); dat doet
 * de app bewust niet zelf en verwijst daarvoor naar het dashboard.
 */
export function ProfielTab() {
  const { colors: t, colorMode } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const { user, profile, role, refreshProfile, signOut } = useAuth();

  const [naamConcept, setNaam] = useState<string | null>(null);
  const naam = naamConcept ?? profile?.full_name ?? '';
  const [ww, setWw] = useState<{ huidig: string; nieuw: string; herhaal: string } | null>(null);
  const [verwijder, setVerwijder] = useState<string | null>(null);
  const [eigenaarId, setEigenaarId] = useState<string | null | undefined>(undefined);
  const { save, saving } = useSave<unknown>();
  const { save: saveWw, saving: wwBezig, error: wwFout } = useSave<unknown>();
  const { save: saveDel, saving: delBezig, error: delFout } = useSave<unknown>();

  useEffect(() => {
    let actief = true;
    getEigenaarId().then((id) => actief && setEigenaarId(id));
    return () => {
      actief = false;
    };
  }, []);

  const isAdmin = role === 'admin';
  const zegtBedrijfOp = isAdmin && (!eigenaarId || eigenaarId === profile?.id);
  const naamGewijzigd = naam.trim() !== (profile?.full_name ?? '').trim();
  const kleuren = avatarKleuren(profile?.full_name || user?.email || '?', colorMode === 'dark');

  const fotoKiezen = async () => {
    if (!profile?.company_id) return;
    const foto = await kiesAfbeelding();
    if (!foto) return;
    save(
      () =>
        uploadEigenAvatar({
          companyId: profile.company_id,
          bytes: foto.bytes,
          contentType: foto.contentType,
          extensie: foto.extensie,
          vorigeUrl: profile.avatar_url,
        }),
      { onSuccess: () => refreshProfile(), succesMelding: 'Profielfoto opgeslagen' },
    );
  };

  const fotoVerwijderen = () =>
    Dialog.alert('Profielfoto verwijderen?', undefined, [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: () =>
          save(() => verwijderEigenAvatar(profile?.avatar_url ?? null), {
            onSuccess: () => refreshProfile(),
            succesMelding: 'Profielfoto verwijderd',
          }),
      },
    ]);

  const naamOpslaan = () =>
    save(() => updateEigenProfiel({ full_name: naam }), {
      onSuccess: async () => {
        await refreshProfile();
        setNaam(null);
      },
      succesMelding: 'Naam opgeslagen',
    });

  const wwKanOpslaan =
    !!ww && ww.huidig.length > 0 && wachtwoordGeldig(ww.nieuw) && ww.nieuw === ww.herhaal;

  const wwOpslaan = () => {
    if (!ww || !wwKanOpslaan) return;
    saveWw(() => wijzigWachtwoordMetHuidig(ww.huidig, ww.nieuw), {
      onSuccess: () => setWw(null),
      succesMelding: 'Wachtwoord gewijzigd',
    });
  };

  const deactiveren = () => {
    if ((verwijder ?? '').trim().toUpperCase() !== 'VERWIJDEREN') return;
    saveDel(() => deactiveerEigenAccount(), {
      onSuccess: async () => {
        setVerwijder(null);
        Dialog.alert('Account gedeactiveerd', 'Je account is gedeactiveerd. Je wordt nu uitgelogd.');
        await signOut();
      },
    });
  };

  return (
    <>
      <Kaart titel="Mijn profiel" sub="Beheer je naam, profielfoto en wachtwoord">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: 64, height: 64, borderRadius: 32 }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: kleuren.bg,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: kleuren.fg }}>
                {initialen(profile?.full_name ?? user?.email ?? '?', '?')}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.lijstTitel} numberOfLines={1}>
              {profile?.full_name || 'Geen naam ingesteld'}
            </Text>
            <Text style={s.lijstSub} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </View>
        <View style={s.knoppen}>
          <Button label="Foto kiezen" variant="secondary" disabled={saving} onPress={fotoKiezen} />
          {profile?.avatar_url ? (
            <Button label="Foto verwijderen" variant="ghost" disabled={saving} onPress={fotoVerwijderen} />
          ) : null}
        </View>
        <Text style={s.hint}>JPG, PNG of WEBP, maximaal 5 MB.</Text>
      </Kaart>

      <Kaart titel="Persoonsgegevens">
        <FormField label="Naam" value={naam} onChangeText={setNaam} placeholder="Voor- en achternaam" />
        {naamGewijzigd ? (
          <Button label="Naam opslaan" loading={saving} disabled={saving || !naam.trim()} onPress={naamOpslaan} />
        ) : null}
        <Gegeven label="E-mailadres" waarde={user?.email ?? ''} />
        <Text style={s.hint}>Je e-mailadres kan niet worden gewijzigd.</Text>
        <Gegeven label="Rol" waarde={ROL[role ?? ''] ?? 'Medewerker'} />
      </Kaart>

      <Kaart titel="Wachtwoord">
        <Button
          label="Wachtwoord wijzigen"
          variant="secondary"
          onPress={() => setWw({ huidig: '', nieuw: '', herhaal: '' })}
        />
      </Kaart>

      <Kaart titel="Gevarenzone">
        <Text style={s.hint}>
          {zegtBedrijfOp
            ? 'Je bent de eigenaar. Bedrijf sluiten beëindigt direct de toegang van jou en je hele team, en zegt het abonnement op. Wil je alleen stoppen met betalen, zeg dan je abonnement op. Beide doe je op het dashboard.'
            : 'Hiermee deactiveer je alleen je eigen account. Je verliest direct toegang; het bedrijf en de gegevens van het team blijven bestaan.'}
        </Text>
        <View style={s.knoppen}>
          {zegtBedrijfOp ? (
            <Button
              label="Bedrijf sluiten op het dashboard"
              variant="secondary"
              onPress={() => openDashboard('instellingen', 'profiel')}
            />
          ) : eigenaarId !== undefined ? (
            <Button label="Account deactiveren" variant="secondary" onPress={() => setVerwijder('')} />
          ) : null}
          <Button
            label="Verwijdering aanvragen"
            variant="ghost"
            onPress={() =>
              openExtern(
                `mailto:info@bossbase.nl?subject=${encodeURIComponent(
                  zegtBedrijfOp
                    ? 'Verzoek: gegevens van mijn bedrijf verwijderen'
                    : 'Verzoek: mijn gegevens verwijderen',
                )}`,
              )
            }
          />
        </View>
      </Kaart>

      <FormSheet
        visible={ww !== null}
        title="Wachtwoord wijzigen"
        subtitle={user?.email ?? undefined}
        error={wwFout}
        saving={wwBezig}
        submitLabel="Wachtwoord opslaan"
        submitDisabled={!wwKanOpslaan}
        onSubmit={wwOpslaan}
        onClose={() => setWw(null)}
      >
        <FormField
          label="Huidig wachtwoord"
          value={ww?.huidig ?? ''}
          onChangeText={(v) => setWw((w) => (w ? { ...w, huidig: v } : w))}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          autoFocus
        />
        <FormField
          label="Nieuw wachtwoord"
          value={ww?.nieuw ?? ''}
          onChangeText={(v) => setWw((w) => (w ? { ...w, nieuw: v } : w))}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
        />
        <View style={{ gap: 4 }}>
          {WACHTWOORD_REGELS.map((r) => {
            const ok = r.test(ww?.nieuw ?? '');
            return (
              <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {ok ? <Check size={14} color={t.green700} /> : <X size={14} color={t.muted2} />}
                <Text style={[s.hint, ok && { color: t.green700 }]}>{r.label}</Text>
              </View>
            );
          })}
        </View>
        <FormField
          label="Herhaal nieuw wachtwoord"
          value={ww?.herhaal ?? ''}
          onChangeText={(v) => setWw((w) => (w ? { ...w, herhaal: v } : w))}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
        />
        {ww?.herhaal && ww.herhaal !== ww.nieuw ? (
          <Text style={[s.hint, { color: t.statusRejectFg }]}>De wachtwoorden komen niet overeen.</Text>
        ) : null}
      </FormSheet>

      <FormSheet
        visible={verwijder !== null}
        title="Account deactiveren"
        subtitle="Lees dit goed door — deze actie heeft gevolgen."
        error={delFout}
        saving={delBezig}
        submitLabel="Account deactiveren"
        submitDisabled={(verwijder ?? '').trim().toUpperCase() !== 'VERWIJDEREN'}
        onSubmit={deactiveren}
        onClose={() => setVerwijder(null)}
      >
        <Uitleg toon="waarschuwing">
          {'• Je wordt direct uitgelogd en kunt niet meer inloggen.\n' +
            '• Wat je in BossBase hebt vastgelegd (uren, werkbonnen, notities) hoort bij het bedrijf en blijft daar staan.\n' +
            '• Je profiel wordt niet verwijderd, zodat een beheerder je later weer kan activeren. Wil je dat je naam en e-mailadres worden verwijderd, mail dan naar info@bossbase.nl.'}
        </Uitleg>
        <FormField
          label="Typ VERWIJDEREN om te bevestigen"
          value={verwijder ?? ''}
          onChangeText={setVerwijder}
          placeholder="VERWIJDEREN"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </FormSheet>
    </>
  );
}
