import Constants from 'expo-constants';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BookOpen, Bug, HelpCircle, Info, Mail, MessageCircleQuestion, Phone } from 'lucide-react-native';
import { AppListGroup, AppListItem, AppScreen, AppSection, AppTopBar } from '@/components';
import { sendMail } from '@/lib/linking';
import { terugOfNaar } from '@/lib/navigatie';
import { FAQ_URL, HULP_MAIL, HULP_TELEFOON, HULP_TELEFOON_LINK, KENNISBANK_URL } from '@/lib/hulp';
import { useTheme } from '@/providers';
import { useHulp } from '@/providers/HulpProvider';

/**
 * Help & support. Help opent Boss, de helpagent van het dashboard; daaronder
 * de kennisbank en veelgestelde vragen op bossbase.nl en het supportnummer.
 */
export default function SupportScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const { openBoss, openMelden } = useHulp();
  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar variant="detail" title="Help & support" subtitle="We helpen je graag verder" onBack={() => terugOfNaar(router, '/menu')} />
        }
      >
        <AppSection title="Hulp" variant="eyebrow" />
        <AppListGroup>
          <AppListItem first icon={MessageCircleQuestion} title="Vraag het Boss" subtitle="Onze helpagent, direct antwoord" onPress={openBoss} />
          <AppListItem icon={BookOpen} title="Kennisbank" subtitle="Uitleg en handleidingen op bossbase.nl" onPress={() => void Linking.openURL(KENNISBANK_URL)} />
          <AppListItem icon={HelpCircle} title="Veelgestelde vragen" subtitle="Snel antwoord op bossbase.nl" onPress={() => void Linking.openURL(FAQ_URL)} />
          <AppListItem icon={Bug} title="Bug of idee" subtitle="Meld het en help BossBase beter maken" onPress={openMelden} />
        </AppListGroup>

        <AppSection title="Contact" variant="eyebrow" />
        <AppListGroup>
          <AppListItem first icon={Phone} title="Bel support" subtitle={HULP_TELEFOON} onPress={() => void Linking.openURL(HULP_TELEFOON_LINK)} />
          <AppListItem icon={Mail} title="E-mail support" subtitle={HULP_MAIL} onPress={() => sendMail(HULP_MAIL)} />
        </AppListGroup>

        <AppSection title="Over" variant="eyebrow" />
        <AppListGroup>
          <AppListItem first icon={Info} title="Versie-informatie" subtitle={`BossBase · v${appVersion}`} />
        </AppListGroup>
      </AppScreen>
    </View>
  );
}
