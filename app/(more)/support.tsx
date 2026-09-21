import Constants from 'expo-constants';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Info, Mail, MessageSquarePlus, Phone } from 'lucide-react-native';
import { AppListGroup, AppListItem, AppScreen, AppSection, AppTopBar } from '@/components';
import { sendMail, callPhone } from '@/lib/linking';
import { useTheme } from '@/providers';

const SUPPORT_EMAIL = 'info@bossbase.nl';
const SUPPORT_PHONE = '+31858881960';

export default function SupportScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Help & support"
            subtitle="We helpen je graag verder"
            onBack={() => router.back()}
          />
        }
      >
        <AppSection title="Contact" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={Mail}
            title="E-mail support"
            subtitle={SUPPORT_EMAIL}
            onPress={() => sendMail(SUPPORT_EMAIL)}
          />
          <AppListItem
            icon={Phone}
            title="Bel support"
            subtitle={SUPPORT_PHONE}
            onPress={() => callPhone(SUPPORT_PHONE)}
          />
          <AppListItem
            icon={MessageSquarePlus}
            title="Feedback sturen"
            subtitle="Deel een idee of meld een probleem"
            onPress={() =>
              sendMail(`${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Feedback BossBase Mobile v${appVersion}`)}`)
            }
          />
        </AppListGroup>

        <AppSection title="Over" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={Info}
            title="Versie-informatie"
            subtitle={`BossBase Mobile · v${appVersion}`}
          />
        </AppListGroup>
      </AppScreen>
    </View>
  );
}
