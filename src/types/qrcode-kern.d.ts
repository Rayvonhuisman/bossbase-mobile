// Alleen de rekenkern van het pakket qrcode (zie src/components/QrCode.tsx).
declare module 'qrcode/lib/core/qrcode' {
  const QRCodeKern: {
    create(
      tekst: string,
      opties?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' },
    ): { modules: { size: number; get(x: number, y: number): boolean | number } };
  };
  export default QRCodeKern;
}
