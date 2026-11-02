import { Image } from 'react-native';

/**
 * BossBase logo mark: het icoon uit het merkbestand van het dashboard
 * (public/brand/logo-bossbase.svg), met dezelfde afgeronde hoeken.
 */
export function BBMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/bossbase-merk.png')}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, borderRadius: size * (22 / 64) }}
    />
  );
}
