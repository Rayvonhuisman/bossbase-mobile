import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { useTheme, useToast } from '@/providers';
import { Dialog } from '@/lib/dialog';
import { writeFout, writeOk, type WriteStatus } from '@/lib/writeResult';
import { useSave } from '@/lib/useSave';
import {
  bevestigMetWachtwoord,
  lokaalUitloggen,
  nieuweSleutel,
  verwijderActie,
  type VerwijderStatus,
} from '@/services/accountVerwijderenService';
import { Kaart, Keuze, Uitleg, stijlVoorInstellingen } from './Bouwstenen';

const datum = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' })
    : '';

type Venster = 'lid' | 'overdracht' | 'bedrijf' | null;

/**
 * Account verwijderen — dezelfde flow als `AccountVerwijderen.jsx` in het
 * dashboard, via de Edge Function `account-verwijderen` (review 26-10, S4-03;
 * Apple 5.1.1(v)).
 *
 *   Teamlid    eigen account definitief verwijderen (wachtwoord + VERWIJDEREN)
 *   Eigenaar   eigendom overdragen aan een beheerder, of het hele bedrijf
 *              verwijderen: over 30 dagen (aanbevolen) of direct
 *
 * Rol, eigendom en bevestigingen controleert de server; het wachtwoord gaat
 * alleen naar Supabase Auth (opnieuw inloggen), nooit naar onze functie.
 */
export function AccountVerwijderen({ onUitgelogd }: { onUitgelogd: () => void }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const { toonResultaat } = useToast();
  const [status, setStatus] = useState<VerwijderStatus | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [venster, setVenster] = useState<Venster>(null);
  const [wachtwoord, setWachtwoord] = useState('');
  const [bevestiging, setBevestiging] = useState('');
  const [ontvanger, setOntvanger] = useState<string | null>(null);
  const [modus, setModus] = useState<'gepland' | 'direct'>('gepland');
  const { save, saving, error } = useSave<unknown>();

  const verwerk = useCallback((r: Awaited<ReturnType<typeof verwijderActie<VerwijderStatus>>>) => {
    if (r.ok) {
      setStatus(r.data);
      setLaadFout(null);
    } else {
      setLaadFout(r.melding);
    }
  }, []);
  const laad = useCallback(async () => verwerk(await verwijderActie<VerwijderStatus>('status')), [verwerk]);
  useEffect(() => {
    let actief = true;
    verwijderActie<VerwijderStatus>('status').then((r) => actief && verwerk(r));
    return () => {
      actief = false;
    };
  }, [verwerk]);

  const open = (v: Venster) => {
    setWachtwoord('');
    setBevestiging('');
    setOntvanger(null);
    setModus('gepland');
    setVenster(v);
  };

  // Na een definitieve verwijdering bestaat de login niet meer.
  const naarBuiten = async (bericht: string) => {
    setVenster(null);
    Dialog.alert('Verwijderd', bericht);
    await lokaalUitloggen();
    onUitgelogd();
  };

  const metWachtwoord = async (stap: () => Promise<WriteStatus>): Promise<WriteStatus> => {
    const fout = await bevestigMetWachtwoord(wachtwoord);
    if (fout) return writeFout('validatie', fout);
    return stap();
  };

  const lidVerwijderen = () =>
    save(() =>
      metWachtwoord(async () => {
        const r = await verwijderActie<{ status: string }>('lid_verwijderen', { sleutel: nieuweSleutel() });
        if (!r.ok) return r;
        await naarBuiten(r.data.status === 'voltooid' ? 'Je account is verwijderd.' : 'Je account wordt verwijderd. Je bent uitgelogd.');
        return writeOk(null);
      }),
    );

  const overdragen = () =>
    save(() =>
      metWachtwoord(async () => {
        const r = await verwijderActie<{ verlooptOp: string }>('overdracht_starten', { naar: ontvanger });
        if (!r.ok) return r;
        setVenster(null);
        toonResultaat(writeOk(null), `Verzoek verstuurd. Het verloopt op ${datum(r.data.verlooptOp)}.`);
        await laad();
        return writeOk(null);
      }),
    );

  const bedrijfVerwijderen = () =>
    save(() =>
      metWachtwoord(async () => {
        if (modus === 'direct') {
          const r = await verwijderActie<{ status: string }>('bedrijf_direct', { sleutel: nieuweSleutel(), bevestiging });
          if (!r.ok) return r;
          await naarBuiten(
            r.data.status === 'voltooid'
              ? 'Het bedrijf en alle accounts zijn verwijderd.'
              : 'Het bedrijf wordt verwijderd. Je bent uitgelogd.',
          );
          return writeOk(null);
        }
        const r = await verwijderActie<{ geplandOp: string }>('bedrijf_plannen', {
          sleutel: nieuweSleutel(),
          bevestiging: 'VERWIJDEREN',
        });
        if (!r.ok) return r;
        setVenster(null);
        toonResultaat(writeOk(null), `Het bedrijf wordt verwijderd op ${datum(r.data.geplandOp)}. Tot die tijd kun je annuleren.`);
        await laad();
        return writeOk(null);
      }),
    );

  const kort = (actie: string, extra: Record<string, unknown>, bericht: string) =>
    save(async () => {
      const r = await verwijderActie(actie, extra);
      if (!r.ok) return r;
      toonResultaat(writeOk(null), bericht);
      await laad();
      return writeOk(null);
    });

  if (laadFout) {
    return (
      <Kaart titel="Account verwijderen">
        <Text style={s.hint}>De gegevens over verwijderen konden niet worden geladen. {laadFout}</Text>
        <View style={s.knoppen}>
          <Button label="Opnieuw proberen" variant="ghost" onPress={() => void laad()} />
        </View>
      </Kaart>
    );
  }
  if (!status) {
    return (
      <Kaart titel="Account verwijderen">
        <Text style={s.hint}>Laden…</Text>
      </Kaart>
    );
  }

  const v = status.verwijdering;
  const eigenaar = status.isEigenaar;
  const kandidaten = status.kandidaten ?? [];

  return (
    <Kaart titel="Account verwijderen">
      {v ? (
        <Uitleg toon="waarschuwing">
          {`Dit bedrijf wordt ${v.modus === 'direct' || v.status === 'bezig' ? 'nu verwijderd' : `verwijderd op ${datum(v.geplandOp)}`}. Tot die tijd kun je alles bekijken en exporteren, maar niets meer wijzigen.`}
        </Uitleg>
      ) : null}
      {v && eigenaar && v.status === 'gepland' ? (
        <View style={s.knoppen}>
          <Button
            label="Verwijdering annuleren"
            variant="secondary"
            disabled={saving}
            onPress={() => kort('bedrijf_annuleren', {}, 'De verwijdering is geannuleerd. Je kunt weer gewoon werken.')}
          />
        </View>
      ) : null}

      {status.overdrachtIn ? (
        <>
          <Uitleg>
            {`${status.overdrachtIn.vanNaam || 'De eigenaar'} wil het eigendom van het bedrijf aan jou overdragen. Als eigenaar beheer je het abonnement en kun je het bedrijf verwijderen. Geldig tot ${datum(status.overdrachtIn.verlooptOp)}.`}
          </Uitleg>
          <View style={s.knoppen}>
            <Button
              label="Accepteren"
              disabled={saving}
              onPress={() => kort('overdracht_accepteren', { id: status.overdrachtIn!.id }, 'Je bent nu de eigenaar van het bedrijf.')}
            />
            <Button
              label="Weigeren"
              variant="ghost"
              disabled={saving}
              onPress={() => kort('overdracht_weigeren', { id: status.overdrachtIn!.id }, 'Je hebt de overdracht geweigerd.')}
            />
          </View>
        </>
      ) : null}

      {!v && eigenaar ? (
        <>
          <Text style={s.hint}>
            Je bent de eigenaar. Wil je alleen je eigen account verwijderen, draag dan eerst het eigendom over aan een
            andere beheerder. Of verwijder het hele bedrijf, met alle teamleden en gegevens. Wil je alleen stoppen met
            betalen, zeg dan je abonnement op (dashboard › Instellingen › Abonnement).
          </Text>
          {status.overdrachtUit ? (
            <>
              <Uitleg>
                {`Overdracht aan ${status.overdrachtUit.naarNaam || 'een beheerder'} wacht op acceptatie (tot ${datum(status.overdrachtUit.verlooptOp)}). Tot die tijd blijf jij eigenaar.`}
              </Uitleg>
              <View style={s.knoppen}>
                <Button
                  label="Overdracht intrekken"
                  variant="ghost"
                  disabled={saving}
                  onPress={() => kort('overdracht_intrekken', { id: status.overdrachtUit!.id }, 'De overdracht is ingetrokken.')}
                />
              </View>
            </>
          ) : null}
          <View style={s.knoppen}>
            <Button
              label="Eigendom overdragen"
              variant="secondary"
              disabled={kandidaten.length === 0 || !!status.overdrachtUit}
              onPress={() => open('overdracht')}
            />
            <Button label="Bedrijf verwijderen" variant="secondary" onPress={() => open('bedrijf')} />
          </View>
          {kandidaten.length === 0 ? (
            <Text style={s.hint}>Overdragen kan aan een actieve beheerder. Maak eerst iemand beheerder bij Team.</Text>
          ) : null}
        </>
      ) : null}

      {!eigenaar ? (
        <>
          <Text style={s.hint}>
            Verwijder je eigen account definitief. Het bedrijf en het werk van je collega’s blijven bestaan.
          </Text>
          <View style={s.knoppen}>
            <Button label="Account verwijderen" variant="secondary" onPress={() => open('lid')} />
          </View>
        </>
      ) : null}

      <FormSheet
        visible={venster === 'lid'}
        title="Account verwijderen"
        subtitle="Dit is definitief en kan niet ongedaan worden gemaakt."
        error={error}
        saving={saving}
        submitLabel="Definitief verwijderen"
        submitDisabled={!wachtwoord || bevestiging.trim().toUpperCase() !== 'VERWIJDEREN'}
        onSubmit={lidVerwijderen}
        onClose={() => setVenster(null)}
      >
        <Uitleg toon="waarschuwing">
          {'• Weg: je login, naam, e-mailadres, telefoonnummer, profielfoto, meldingen en koppelingen. Je wordt overal uitgelogd.\n' +
            '• Blijft bij het bedrijf: wat je voor het bedrijf hebt vastgelegd (uren, werkbonnen, notities). Daar staat voortaan „Verwijderde gebruiker”.\n' +
            '• Het bedrijf en de accounts van je collega’s blijven bestaan.'}
        </Uitleg>
        <FormField
          label="Bevestig met je wachtwoord"
          value={wachtwoord}
          onChangeText={setWachtwoord}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
        />
        <FormField
          label="Typ VERWIJDEREN om te bevestigen"
          value={bevestiging}
          onChangeText={setBevestiging}
          placeholder="VERWIJDEREN"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </FormSheet>

      <FormSheet
        visible={venster === 'overdracht'}
        title="Eigendom overdragen"
        subtitle="De nieuwe eigenaar moet het verzoek accepteren."
        error={error}
        saving={saving}
        submitLabel="Verzoek versturen"
        submitDisabled={!ontvanger || !wachtwoord}
        onSubmit={overdragen}
        onClose={() => setVenster(null)}
      >
        <Uitleg>
          {'• De nieuwe eigenaar beheert het abonnement en kan het bedrijf verwijderen.\n' +
            '• Tot de acceptatie blijf jij eigenaar. Het verzoek verloopt na 7 dagen; je kunt het eerder intrekken.\n' +
            '• Daarna kun je je eigen account verwijderen.'}
        </Uitleg>
        <Keuze
          label="Nieuwe eigenaar"
          opties={kandidaten.map((k) => ({ id: k.id, label: k.naam || 'Beheerder' }))}
          waarde={ontvanger}
          onKies={setOntvanger}
        />
        <FormField
          label="Bevestig met je wachtwoord"
          value={wachtwoord}
          onChangeText={setWachtwoord}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
        />
      </FormSheet>

      <FormSheet
        visible={venster === 'bedrijf'}
        title="Bedrijf verwijderen"
        subtitle={status.bedrijfsnaam ?? undefined}
        error={error}
        saving={saving}
        submitLabel={modus === 'direct' ? 'Nu definitief verwijderen' : 'Verwijderen over 30 dagen'}
        submitDisabled={!wachtwoord || (modus === 'direct' && bevestiging !== status.bedrijfsnaam)}
        onSubmit={bedrijfVerwijderen}
        onClose={() => setVenster(null)}
      >
        <Uitleg toon="waarschuwing">
          {`• Weg: alle klanten, projecten, werkbonnen, uren, planning, offertes, facturen, kosten, bestanden en foto’s, en de accounts van jou en ${status.teamleden ? `${status.teamleden} teamleden` : 'je team'}.\n` +
            '• Abonnement: stopt op de verwijderdatum; daarna wordt er niets meer afgeschreven.\n' +
            '• Wat BossBase bewaart: alleen de facturen die BossBase jou stuurde en de betaalgegevens daarvan, 7 jaar (wettelijke bewaarplicht), plus een kort technisch bewijs van dit verzoek.\n' +
            '• Exporteer eerst wat je zelf moet bewaren, zoals je facturen en btw-gegevens (op het dashboard). Jouw eigen administratieplicht blijft gelden.'}
        </Uitleg>
        <Keuze
          label="Wanneer?"
          opties={[
            { id: 'gepland', label: 'Over 30 dagen (aanbevolen): eerst alleen-lezen, annuleren kan nog' },
            { id: 'direct', label: 'Nu definitief: alles is direct weg' },
          ]}
          waarde={modus}
          onKies={(id) => setModus(id as 'gepland' | 'direct')}
        />
        {modus === 'direct' ? (
          <FormField
            label={`Typ de bedrijfsnaam “${status.bedrijfsnaam ?? ''}” om te bevestigen`}
            value={bevestiging}
            onChangeText={setBevestiging}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        <FormField
          label="Bevestig met je wachtwoord"
          value={wachtwoord}
          onChangeText={setWachtwoord}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
        />
      </FormSheet>
    </Kaart>
  );
}
