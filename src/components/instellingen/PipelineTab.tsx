import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Pencil, Trash2 } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { SelectField } from '@/components/SelectField';
import { useTheme } from '@/providers';
import { Dialog } from '@/lib/dialog';
import { useSave } from '@/lib/useSave';
import {
  FASE_KLEUREN,
  PIPELINE_MOMENTEN,
  STANDAARD_FASE_KLEUR,
  faseKleurHex,
  faseKleurLabel,
} from '@/lib/instellingenRegels';
import {
  createFase,
  createVerlorenReden,
  deleteFase,
  deleteVerlorenReden,
  listFasen,
  listKoppelingen,
  listVerlorenRedenen,
  updateFase,
  updateVerlorenReden,
  zetKoppeling,
  type Fase,
  type VerlorenReden,
} from '@/services/instellingenService';
import { Kaart, Uitleg, stijlVoorInstellingen } from './Bouwstenen';

/**
 * Pipeline — koppeling met de uitvoering (`pipeline_koppelingen`), fasen
 * (`pipeline_stages`) en verloren-redenen (`lost_reasons`). Zien mag iedereen
 * met het recht Instellingen; wijzigen alleen een beheerder, net als het
 * dashboard. Herordenen van fasen kan ook in het dashboard niet.
 */
export function PipelineTab({ isAdmin }: { isAdmin: boolean }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const [fasen, setFasen] = useState<Fase[]>([]);
  const [koppelingen, setKoppelingen] = useState<Record<string, string | null>>({});
  const [redenen, setRedenen] = useState<VerlorenReden[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [fase, setFase] = useState<{ id: string | null; name: string; kleur: string } | null>(null);
  const [reden, setReden] = useState<{ id: string | null; label: string } | null>(null);
  const { save, saving, error, setError } = useSave<unknown>();

  const haal = () => Promise.all([listFasen(), listKoppelingen(), listVerlorenRedenen()]);
  const verwerk = useCallback(([f, k, r]: Awaited<ReturnType<typeof haal>>) => {
    setFasen(f.data);
    setFout(f.error);
    setKoppelingen(k);
    setRedenen(r);
  }, []);
  const laad = useCallback(async () => verwerk(await haal()), [verwerk]);

  useEffect(() => {
    let actief = true;
    haal().then((r) => actief && verwerk(r));
    return () => {
      actief = false;
    };
  }, [verwerk]);

  const koppel = (moment: string, stageId: string | null) => {
    const vorige = koppelingen[moment] ?? null;
    setKoppelingen((k) => ({ ...k, [moment]: stageId }));
    save(() => zetKoppeling(moment, stageId), { succesMelding: 'Koppeling opgeslagen' }).then((res) => {
      if (res && !res.ok) setKoppelingen((k) => ({ ...k, [moment]: vorige }));
    });
  };

  const faseOpslaan = () => {
    if (!fase) return;
    save(
      () =>
        fase.id
          ? updateFase(fase.id, { name: fase.name, color_class: fase.kleur })
          : createFase({ name: fase.name, color_class: fase.kleur }),
      {
        onSuccess: async () => {
          setFase(null);
          await laad();
        },
        succesMelding: fase.id ? 'Fase bijgewerkt' : 'Fase aangemaakt',
      },
    );
  };

  const faseVerwijderen = (f: Fase) => {
    const geraakt = PIPELINE_MOMENTEN.filter((m) => koppelingen[m.key] === f.id).map((m) => m.label);
    const kop = geraakt.length
      ? `Let op: deze fase is gekoppeld aan ${geraakt.join(' en ')}. Die koppeling vervalt.\n\n`
      : '';
    Dialog.alert('Fase verwijderen?', `${kop}Dit kan niet ongedaan worden gemaakt.`, [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: () =>
          save(() => deleteFase(f.id), {
            onSuccess: () => laad(),
            succesMelding: geraakt.length
              ? `Fase verwijderd — koppeling voor ${geraakt.join(' en ')} vervallen`
              : 'Fase verwijderd',
          }),
      },
    ]);
  };

  const redenOpslaan = () => {
    if (!reden) return;
    save(() => (reden.id ? updateVerlorenReden(reden.id, reden.label) : createVerlorenReden(reden.label)), {
      onSuccess: async () => {
        setReden(null);
        await laad();
      },
      succesMelding: reden.id ? 'Reden bijgewerkt' : 'Reden aangemaakt',
    });
  };

  const redenVerwijderen = (r: VerlorenReden) =>
    Dialog.alert(
      'Verloren-reden verwijderen?',
      'Bestaande leads met deze reden behouden hun opgeslagen tekst.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: () =>
            save(() => deleteVerlorenReden(r.id), { onSuccess: () => laad(), succesMelding: 'Reden verwijderd' }),
        },
      ],
    );

  const faseOpties = fasen.map((f) => ({ id: f.id, label: f.name }));

  return (
    <>
      {!isAdmin ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Uitleg>Je kunt de pipeline bekijken. Wijzigen kan alleen een beheerder.</Uitleg>
        </View>
      ) : null}
      {fout ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Uitleg toon="fout">{fout}</Uitleg>
        </View>
      ) : null}

      <Kaart
        titel="Koppeling met uitvoering"
        sub="Welke fase hoort bij welk moment in de uitvoering. Een deal schuift automatisch door zodra het moment bereikt is."
      >
        {PIPELINE_MOMENTEN.map((m) => (
          <View key={m.key} style={{ gap: 2 }}>
            <SelectField
              label={m.label}
              options={faseOpties}
              value={koppelingen[m.key] ?? null}
              onChange={(id) => koppel(m.key, id)}
              allowEmpty
              emptyLabel="— Niet gekoppeld —"
              placeholder="— Niet gekoppeld —"
              disabled={!isAdmin || saving}
              hint={m.uitleg}
            />
          </View>
        ))}
      </Kaart>

      <Kaart
        titel="Pipelinefasen"
        rechts={
          isAdmin ? (
            <Button
              label="Fase toevoegen"
              variant="secondary"
              onPress={() => {
                setError(null);
                setFase({ id: null, name: '', kleur: STANDAARD_FASE_KLEUR });
              }}
            />
          ) : undefined
        }
      >
        {fasen.length === 0 ? <Text style={s.hint}>Nog geen fasen.</Text> : null}
        {fasen.map((f) => (
          <View key={f.id} style={s.lijstRij}>
            <View style={[s.stip, { backgroundColor: faseKleurHex(f.color_class) }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.lijstTitel}>{f.name}</Text>
              <Text style={s.lijstSub}>{faseKleurLabel(f.color_class)}</Text>
            </View>
            {isAdmin ? (
              <>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setFase({ id: f.id, name: f.name, kleur: faseKleurHex(f.color_class) });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.name} bewerken`}
                  style={s.iconKnop}
                >
                  <Pencil size={17} color={t.muted} />
                </Pressable>
                <Pressable
                  onPress={() => faseVerwijderen(f)}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.name} verwijderen`}
                  style={s.iconKnop}
                >
                  <Trash2 size={17} color={t.statusRejectFg} />
                </Pressable>
              </>
            ) : null}
          </View>
        ))}
      </Kaart>

      <Kaart
        titel="Verloren-redenen"
        sub="De keuzes als je een deal op verloren zet."
        rechts={
          isAdmin ? (
            <Button
              label="Reden toevoegen"
              variant="secondary"
              onPress={() => {
                setError(null);
                setReden({ id: null, label: '' });
              }}
            />
          ) : undefined
        }
      >
        {redenen.length === 0 ? <Text style={s.hint}>Nog geen redenen.</Text> : null}
        {redenen.map((r) => (
          <View key={r.id} style={s.lijstRij}>
            <Text style={[s.lijstTitel, { flex: 1 }]}>{r.label}</Text>
            {isAdmin ? (
              <>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setReden({ id: r.id, label: r.label });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.label} bewerken`}
                  style={s.iconKnop}
                >
                  <Pencil size={17} color={t.muted} />
                </Pressable>
                <Pressable
                  onPress={() => redenVerwijderen(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.label} verwijderen`}
                  style={s.iconKnop}
                >
                  <Trash2 size={17} color={t.statusRejectFg} />
                </Pressable>
              </>
            ) : null}
          </View>
        ))}
      </Kaart>

      <FormSheet
        visible={fase !== null}
        title={fase?.id ? 'Fase bewerken' : 'Nieuwe fase'}
        error={error}
        saving={saving}
        submitDisabled={!fase?.name.trim()}
        onSubmit={faseOpslaan}
        onClose={() => setFase(null)}
      >
        <FormField
          label="Naam"
          value={fase?.name ?? ''}
          onChangeText={(v) => setFase((c) => (c ? { ...c, name: v } : c))}
          autoFocus
        />
        <Text style={s.label}>Kleur</Text>
        <View style={s.chipRij}>
          {FASE_KLEUREN.map((k) => {
            const gekozen = (fase?.kleur ?? '').toLowerCase() === k.value.toLowerCase();
            return (
              <Pressable
                key={k.value}
                onPress={() => setFase((c) => (c ? { ...c, kleur: k.value } : c))}
                accessibilityRole="button"
                accessibilityState={{ selected: gekozen }}
                style={[
                  s.chip,
                  { flexDirection: 'row', alignItems: 'center', gap: 6 },
                  gekozen && { borderColor: t.ink, borderWidth: 2 },
                ]}
              >
                <View style={[s.stip, { backgroundColor: k.value }]} />
                <Text style={s.chipTekst}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </FormSheet>

      <FormSheet
        visible={reden !== null}
        title={reden?.id ? 'Reden bewerken' : 'Nieuwe reden'}
        error={error}
        saving={saving}
        submitDisabled={!reden?.label.trim()}
        onSubmit={redenOpslaan}
        onClose={() => setReden(null)}
      >
        <FormField
          label="Reden"
          value={reden?.label ?? ''}
          onChangeText={(v) => setReden((c) => (c ? { ...c, label: v } : c))}
          autoFocus
        />
      </FormSheet>
    </>
  );
}
