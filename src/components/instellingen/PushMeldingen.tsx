import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
import { Button } from '@/components/Button';
import { useAuth, useTheme } from '@/providers';
import { pushStand, zetPushAan, zetPushUit, type PushStand } from '@/lib/push';
import { Kaart, stijlVoorInstellingen } from './Bouwstenen';
import { tx } from '@/i18n';

/**
 * Pushmeldingen op dit toestel aan- of uitzetten (src/lib/push.web.ts).
 * Dezelfde meldingen als de bel. Alleen in de webapp; in de native app (nog) niet.
 */
export function PushMeldingen() {
  const { user } = useAuth();
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const [stand, setStand] = useState<PushStand | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const [ververs, setVervers] = useState(0);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return undefined;
    let weg = false;
    pushStand(userId)
      .then((x) => { if (!weg) setStand(x); })
      .catch(() => { if (!weg) setStand('niet-mogelijk'); });
    return () => { weg = true; };
  }, [userId, ververs]);

  if (!user?.id || stand === null || stand === 'niet-mogelijk') return null;

  const wissel = async () => {
    setBezig(true);
    setFout('');
    try {
      if (stand === 'aan') await zetPushUit();
      else await zetPushAan(user.id);
    } catch (e) {
      setFout(e instanceof Error ? e.message : tx('Dat is niet gelukt.'));
    } finally {
      setBezig(false);
      setVervers((v) => v + 1);
    }
  };

  return (
    <Kaart titel={tx('Meldingen op dit toestel')} sub={tx('Een melding op je telefoon bij alles wat ook in de bel komt')}>
      {stand === 'ios-installeren' ? (
        <Text style={s.hint}>
          {tx('Op iPhone en iPad werken meldingen alleen in de app op je beginscherm. Tik in Safari op Delen → Zet op beginscherm, open BossBase daar en zet ze aan.')}
        </Text>
      ) : stand === 'geblokkeerd' ? (
        <Text style={s.hint}>{tx('Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je telefoon of browser.')}</Text>
      ) : (
        <>
          <Text style={s.hint}>{stand === 'aan' ? tx('Staan aan op dit toestel.') : tx('Staan uit op dit toestel.')}</Text>
          <Button
            label={stand === 'aan' ? tx('Meldingen uitzetten') : tx('Meldingen aanzetten')}
            variant={stand === 'aan' ? 'secondary' : 'primary'}
            loading={bezig}
            disabled={bezig}
            onPress={wissel}
          />
        </>
      )}
      {fout ? <Text style={[s.hint, { color: t.statusRejectFg }]}>{fout}</Text> : null}
    </Kaart>
  );
}
