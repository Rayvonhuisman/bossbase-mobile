import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/providers';
import { maakStijl, type HandtekeningProps } from './handtekeningStijl';

/**
 * Web/PWA: een gewoon canvas, met dezelfde tekenregels als HandtekeningCanvas
 * in het dashboard (aanraken én muis, 160 hoog, geen resize-listener — die
 * wist het vak als het toetsenbord opkomt).
 */
export function HandtekeningVak({
  onChange,
  disabled,
  onTekenen,
  titel = 'Handtekening klant',
  plaatshouder = 'Laat de klant hier tekenen',
}: HandtekeningProps) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => maakStijl(t), [t]);
  const ref = useRef<HTMLCanvasElement>(null);
  const [heeft, setHeeft] = useState(false);
  const onChangeRef = useRef(onChange);
  const onTekenenRef = useRef(onTekenen);
  useEffect(() => {
    onChangeRef.current = onChange;
    onTekenenRef.current = onTekenen;
  });

  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    c.width = c.offsetWidth;
    c.height = 160;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let teken = false;
    let laatste: { x: number; y: number } | null = null;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const start = (e: PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      c.setPointerCapture?.(e.pointerId);
      teken = true;
      laatste = pos(e);
      onTekenenRef.current?.(true);
    };
    const beweeg = (e: PointerEvent) => {
      if (!teken || disabled || !laatste) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(laatste.x, laatste.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      laatste = p;
      setHeeft(true);
    };
    const eind = () => {
      if (!teken) return;
      teken = false;
      onTekenenRef.current?.(false);
      onChangeRef.current(c.toDataURL('image/png'));
    };
    c.addEventListener('pointerdown', start);
    c.addEventListener('pointermove', beweeg);
    c.addEventListener('pointerup', eind);
    c.addEventListener('pointercancel', eind);
    c.addEventListener('pointerleave', eind);
    return () => {
      c.removeEventListener('pointerdown', start);
      c.removeEventListener('pointermove', beweeg);
      c.removeEventListener('pointerup', eind);
      c.removeEventListener('pointercancel', eind);
      c.removeEventListener('pointerleave', eind);
    };
  }, [disabled]);

  const wis = () => {
    const c = ref.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setHeeft(false);
    onChange(null);
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.kop}>
        <Text style={styles.titel}>{titel}</Text>
        {heeft && !disabled ? (
          <Pressable onPress={wis} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.wis}>Wissen</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.vak, disabled && { opacity: 0.6 }]}>
        <canvas
          ref={ref}
          aria-label={titel}
          style={{ display: 'block', width: '100%', height: 160, touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }}
        />
        {!heeft ? (
          <View style={styles.leeg} pointerEvents="none">
            <Text style={styles.leegTekst}>{plaatshouder}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
