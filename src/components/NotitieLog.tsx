import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from './Button';
import { FormField } from './FormField';
import { useStijl } from '@/components/project/bouwstenen';
import { formatDateNL, formatPlanningTime } from '@/lib/format';
import { lokaleDatum } from '@/lib/nlTijd';
import { alsHtml, alsTekst } from '@/lib/notitieTekst';
import { mentionZoekterm, tekstMetVermeldingen } from '@/lib/mentions';

export type LogItem = { id: string; html: string; auteur: string; at: string };
export type LogLid = { id: string; full_name: string };

export type Getagd = { id: string; naam: string };

/**
 * Een tekstveld met @-vermeldingen: typ @ en kies een collega uit de chips
 * eronder (NoteEditor.detectMention). `gekozen` houdt bij wie er gekozen is;
 * `naarHtml` maakt er bij opslaan de mention-spans van.
 */
export function MentionInvoer({
  label,
  value,
  onChangeText,
  gekozen,
  onGekozen,
  leden,
  placeholder = 'Typ @ om iemand te taggen',
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  gekozen: Getagd[];
  onGekozen: (g: Getagd[]) => void;
  leden: LogLid[];
  placeholder?: string;
  editable?: boolean;
}) {
  const { styles } = useStijl();
  const [cursor, setCursor] = useState(0);
  const zoek = editable ? mentionZoekterm(value, cursor) : null;
  const keuzes =
    zoek === null
      ? []
      : leden.filter((l) => l.full_name.toLowerCase().includes(zoek.term.trim().toLowerCase())).slice(0, 6);

  const kies = (l: LogLid) => {
    if (!zoek) return;
    const invoeg = `@${l.full_name} `;
    onChangeText(`${value.slice(0, zoek.start)}${invoeg}${value.slice(cursor)}`);
    setCursor(zoek.start + invoeg.length);
    if (!gekozen.some((x) => x.id === l.id)) onGekozen([...gekozen, { id: l.id, naam: l.full_name }]);
  };

  return (
    <>
      <FormField
        label={label}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
        placeholder={placeholder}
        multiline
        editable={editable}
      />
      {keuzes.length ? (
        <View style={styles.chipRij} accessibilityLabel="Collega taggen">
          {keuzes.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => kies(l)}
              accessibilityRole="button"
              accessibilityLabel={`${l.full_name} taggen`}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.chipTekst}>@{l.full_name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  );
}

/** Platte tekst + gekozen tags → wat er wordt opgeslagen, en of er iemand getagd is. */
export function naarHtml(tekst: string, gekozen: Getagd[]): { html: string; getagd: boolean } {
  const schoon = tekst.trim();
  const metTag = gekozen.filter((g) => schoon.includes(`@${g.naam}`));
  return metTag.length
    ? { html: tekstMetVermeldingen(schoon, metTag), getagd: true }
    : { html: alsHtml(schoon), getagd: false };
}

/**
 * Een notitielog zoals `NotitieLog` in het dashboard: een invoerveld met
 * @-vermeldingen (typ @ en kies een collega) en de notities eronder, nieuwste
 * eerst. Opslaan en meldingen doet de ouder in `onPlaats`; die krijgt de HTML
 * (met mention-span bij een tag, anders veilige HTML) en geeft true bij succes.
 */
export function NotitieLog({
  label = 'Notities',
  items,
  leden,
  magSchrijven = true,
  bezig = false,
  fout,
  onPlaats,
}: {
  label?: string;
  items: LogItem[];
  leden: LogLid[];
  magSchrijven?: boolean;
  bezig?: boolean;
  fout?: string | null;
  onPlaats: (html: string, getagd: boolean) => Promise<boolean>;
}) {
  const { styles, t } = useStijl();
  const [tekst, setTekst] = useState('');
  const [gekozen, setGekozen] = useState<Getagd[]>([]);

  const plaats = async () => {
    if (!tekst.trim()) return;
    const { html, getagd } = naarHtml(tekst, gekozen);
    if (await onPlaats(html, getagd)) {
      setTekst('');
      setGekozen([]);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {magSchrijven ? (
        <>
          <MentionInvoer
            label={label}
            value={tekst}
            onChangeText={setTekst}
            gekozen={gekozen}
            onGekozen={setGekozen}
            leden={leden}
            placeholder="Schrijf een notitie… Typ @ om iemand te taggen"
          />
          {fout ? <Text style={[styles.klein, { color: t.statusRejectFg }]}>{fout}</Text> : null}
          <View style={{ alignItems: 'flex-end' }}>
            <Button
              label="Plaatsen"
              variant="secondary"
              onPress={plaats}
              loading={bezig}
              disabled={!tekst.trim() || bezig}
            />
          </View>
        </>
      ) : (
        <Text style={styles.veldLabel}>{label}</Text>
      )}
      {items.length === 0 ? <Text style={styles.leeg}>Nog geen notities.</Text> : null}
      {items.map((n) => (
        <View key={n.id} style={styles.notitie}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.notitieMeta}>
              {n.auteur || 'Onbekend'} · {formatDateNL(lokaleDatum(n.at))} {formatPlanningTime(n.at)}
            </Text>
            <Text style={styles.tekst}>{alsTekst(n.html)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
