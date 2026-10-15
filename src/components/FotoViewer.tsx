import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react-native';

export type ViewerFoto = { id: string; url: string };

/**
 * Foto's schermvullend bekijken, in de app in plaats van in een browsertab:
 * vegen of de pijlen voor de volgende, het kruisje om te sluiten, en (als je
 * mag) de prullenbak. Zwart vlak, zodat de foto zelf het licht geeft.
 *
 * `index` null = dicht. De ouder beslist over verwijderen (met bevestiging).
 */
type Props = {
  fotos: ViewerFoto[];
  index: number | null;
  titel?: string;
  onSluit: () => void;
  onVerwijder?: (foto: ViewerFoto) => void;
};

export function FotoViewer(props: Props) {
  const open = props.index != null && props.fotos.length > 0;
  // Verwijderd tot er niets meer over is: dicht.
  const { index, fotos, onSluit } = props;
  useEffect(() => {
    if (index != null && fotos.length === 0) onSluit();
  }, [fotos.length, index, onSluit]);
  return (
    <Modal visible={open} animationType="fade" onRequestClose={props.onSluit} transparent={false}>
      {/* Per geopende foto opnieuw opgebouwd (key), zodat hij op die foto begint. */}
      {open ? <ViewerInhoud key={props.index} {...props} start={props.index ?? 0} /> : null}
    </Modal>
  );
}

function ViewerInhoud({ fotos, start, titel, onSluit, onVerwijder }: Props & { start: number }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const lijst = useRef<FlatList<ViewerFoto>>(null);
  const [huidig, setHuidig] = useState(start);

  const naar = (i: number) => {
    const doel = Math.max(0, Math.min(fotos.length - 1, i));
    setHuidig(doel);
    lijst.current?.scrollToIndex({ index: doel, animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== huidig && i >= 0 && i < fotos.length) setHuidig(i);
  };

  const foto = fotos[Math.min(huidig, fotos.length - 1)];

  return (
    <View style={styles.vlak}>
      <FlatList
        ref={lijst}
        data={fotos}
        keyExtractor={(f) => f.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
        onMomentumScrollEnd={onScroll}
        onScroll={onScroll}
        scrollEventThrottle={64}
        renderItem={({ item }) => (
          <View
            style={{
              width,
              height,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              source={{ uri: item.url }}
              style={{
                width,
                height: height - insets.top - insets.bottom - 120,
              }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
        )}
      />

      <View style={[styles.balk, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={onSluit}
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
          hitSlop={8}
          style={styles.knop}
        >
          <X size={22} color="#fff" strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.teller} numberOfLines={1}>
          {[titel, fotos.length > 1 ? `${huidig + 1} van ${fotos.length}` : null].filter(Boolean).join(' · ')}
        </Text>
        {onVerwijder && foto ? (
          <Pressable
            onPress={() => onVerwijder(foto)}
            accessibilityRole="button"
            accessibilityLabel="Foto verwijderen"
            hitSlop={8}
            style={styles.knop}
          >
            <Trash2 size={20} color="#fff" />
          </Pressable>
        ) : (
          <View style={styles.knop} />
        )}
      </View>

      {fotos.length > 1 ? (
        <>
          {huidig > 0 ? (
            <Pressable
              onPress={() => naar(huidig - 1)}
              accessibilityRole="button"
              accessibilityLabel="Vorige foto"
              style={[styles.pijl, { left: 12 }]}
            >
              <ChevronLeft size={26} color="#fff" />
            </Pressable>
          ) : null}
          {huidig < fotos.length - 1 ? (
            <Pressable
              onPress={() => naar(huidig + 1)}
              accessibilityRole="button"
              accessibilityLabel="Volgende foto"
              style={[styles.pijl, { right: 12 }]}
            >
              <ChevronRight size={26} color="#fff" />
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  vlak: { flex: 1, backgroundColor: '#000' },
  balk: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  knop: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teller: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  pijl: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
