import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Props = {
  value: string;
  size?: number;
};

export function QrCode({ value, size = 200 }: Props) {
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: 'svg',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch((err) => {
        if (!cancelled) console.error('QR render failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      aria-label="Join QR code"
      className="rounded-lg bg-white p-2 inline-block leading-none"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
