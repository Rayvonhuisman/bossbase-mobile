import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { useTheme } from '@/providers';
import { Dialog } from '@/lib/dialog';
import { useSave } from '@/lib/useSave';
import { FASE_KLEUREN } from '@/lib/instellingenRegels';
import { deleteVoertuig, listVoertuigen, saveVoertuig, type Voertuig } from '@/services/instellingenService';
import { Kaart, Schakel, Uitleg, stijlVoorInstellingen } from './Bouwstenen';
import { tx, txn } from '@/i18n';

type Concept = {
  id: string | null;
  naam: string;
  kenteken: string;
  zitplaatsen: string;
  kleur: string;
  actief: boolean;
};

/**
 * Voertuigen — tabel `voertuigen` (naam*, kenteken, zitplaatsen 1-99 of leeg
 * = geen limiet, kleur, actief). Alleen voor een beheerder met de feature
 * `voertuigen`; de tab is anders niet zichtbaar, net als in het dashboard.
 */
export function VoertuigenTab() {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const [lijst, setLijst] = useState<Voertuig[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const { save, saving, error, setError } = useSave<unknown>();

  const verwerk = useCallback((res: Awaited<ReturnType<typeof listVoertuigen>>) => {
    setLijst(res.data);
    setFout(res.error);
  }, []);
  const laad = useCallback(async () => verwerk(await listVoertuigen()), [verwerk]);

  useEffect(() => {
    let actief = true;
    listVoertuigen().then((r) => actief && verwerk(r));
    return () => {
      actief = false;
    };
  }, [verwerk]);

  const opslaan = () => {
    if (!concept) return;
    save(() => saveVoertuig(concept.id, concept), {
      onSuccess: async () => {
        setConcept(null);
        await laad();
      },
      succesMelding: concept.id ? tx('Voertuig bijgewerkt') : tx('Voertuig toegevoegd'),
    });
  };

  const verwijderen = (v: Voertuig) =>
    Dialog.alert(tx('{naam} verwijderen?', { naam: v.naam }), tx('Dit kan niet ongedaan worden gemaakt.'), [
      { text: tx('Annuleren'), style: 'cancel' },
      {
        text: tx('Verwijderen'),
        style: 'destructive',
        onPress: () =>
          save(() => deleteVoertuig(v.id), {
            onSuccess: async () => {
              setConcept(null);
              await laad();
            },
            succesMelding: tx('Voertuig verwijderd'),
          }),
      },
    ]);

  return (
    <>
      <Kaart
        titel={tx('Voertuigen')}
        sub={tx('Bestelauto\'s, aanhangers, machines: alles wat je bij een klus inplant.')}
        rechts={
          <Button
            label={tx('Toevoegen')}
            variant="secondary"
            onPress={() => {
              setError(null);
              setConcept({ id: null, naam: '', kenteken: '', zitplaatsen: '', kleur: '#1DDB62', actief: true });
            }}
          />
        }
      >
        {fout ? <Uitleg toon="fout">{fout}</Uitleg> : null}
        {lijst.length === 0 && !fout ? <Text style={s.hint}>{tx('Nog geen voertuigen.')}</Text> : null}
        {lijst.map((v) => (
          <Pressable
            key={v.id}
            onPress={() => {
              setError(null);
              setConcept({
                id: v.id,
                naam: v.naam,
                kenteken: v.kenteken,
                zitplaatsen: v.zitplaatsen == null ? '' : String(v.zitplaatsen),
                kleur: v.kleur,
                actief: v.actief,
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={tx('{naam} bewerken', { naam: v.naam })}
            style={({ pressed }) => [s.lijstRij, pressed && { opacity: 0.8 }]}
          >
            <View style={[s.stip, { backgroundColor: v.kleur }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.lijstTitel, !v.actief && { color: t.muted }]}>{v.naam}</Text>
              <Text style={s.lijstSub}>
                {[
                  v.kenteken || null,
                  v.zitplaatsen != null ? txn('{n} zitplaats', '{n} zitplaatsen', v.zitplaatsen) : tx('Geen limiet'),
                  v.actief ? tx('Actief') : tx('Inactief'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
        ))}
      </Kaart>

      <FormSheet
        visible={concept !== null}
        title={concept?.id ? tx('Voertuig bewerken') : tx('Nieuw voertuig')}
        error={error}
        saving={saving}
        submitDisabled={!concept?.naam.trim()}
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id
            ? {
                label: tx('Voertuig verwijderen'),
                onPress: () => {
                  const v = lijst.find((x) => x.id === concept.id);
                  if (v) verwijderen(v);
                },
              }
            : undefined
        }
      >
        <FormField
          label={tx('Naam *')}
          value={concept?.naam ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, naam: v } : c))}
          placeholder={tx('Bijv. Bestelauto 1')}
          autoFocus={!concept?.id}
        />
        <View style={s.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label={tx('Kenteken')}
              value={concept?.kenteken ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, kenteken: v } : c))}
              autoCapitalize="characters"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label={tx('Zitplaatsen')}
              value={concept?.zitplaatsen ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, zitplaatsen: v } : c))}
              keyboardType="number-pad"
              placeholder={tx('Geen limiet')}
            />
          </View>
        </View>
        <Text style={s.label}>{tx('Kleur')}</Text>
        <View style={s.chipRij}>
          {FASE_KLEUREN.map((k) => {
            const gekozen = (concept?.kleur ?? '').toLowerCase() === k.value.toLowerCase();
            return (
              <Pressable
                key={k.value}
                onPress={() => setConcept((c) => (c ? { ...c, kleur: k.value } : c))}
                accessibilityRole="button"
                accessibilityLabel={tx('Kleur {kleur}', { kleur: k.label })}
                accessibilityState={{ selected: gekozen }}
                aria-pressed={gekozen}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: gekozen ? 2 : 1,
                  borderColor: gekozen ? t.ink : t.line,
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: k.value }} />
              </Pressable>
            );
          })}
        </View>
        {concept?.id ? (
          <Schakel
            titel={tx('Actief')}
            uitleg={tx('Een inactief voertuig blijft bewaard maar kun je niet meer inplannen.')}
            waarde={concept.actief}
            onWissel={(v) => setConcept((c) => (c ? { ...c, actief: v } : c))}
          />
        ) : null}
      </FormSheet>
    </>
  );
}
