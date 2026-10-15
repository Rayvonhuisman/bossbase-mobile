import { Dimensions, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { TABLET_VANAF } from './schermklasseRegels';

/**
 * Android-telefoons staand houden; tablets mogen draaien. (iPhone: via
 * Info.plist, zie app.config.ts.) Op de korte kant van het scherm beslist,
 * zodat het niet uitmaakt hoe het toestel vastgehouden wordt bij het starten.
 */
export function zetSchermstand(): void {
  if (Platform.OS !== 'android') return;
  const { width, height } = Dimensions.get('screen');
  if (Math.min(width, height) < TABLET_VANAF) {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }
}
