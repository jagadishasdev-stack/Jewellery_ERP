/**
 * Off-screen QR code data-URL generator — for print flows that don't have
 * an already-mounted <QRCodeCanvas> to read from (see BarcodeLabel.jsx for
 * the on-screen equivalent, which reads its own already-painted canvas
 * directly since it's rendered before the user clicks Print).
 *
 * QRCodeCanvas draws onto its canvas inside a useEffect (runs after paint),
 * so we wait a couple of animation frames before reading it back out.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';

export const generateQrDataUrl = (value, size = 160) =>
  new Promise((resolve) => {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed; left:-9999px; top:-9999px;';
    document.body.appendChild(container);
    const root = createRoot(container);

    root.render(
      React.createElement(QRCodeCanvas, {
        value: value || '',
        size,
        level: 'M',
        includeMargin: false,
      })
    );

    const finish = () => {
      const canvasEl = container.querySelector('canvas');
      const dataUrl = canvasEl ? canvasEl.toDataURL('image/png') : '';
      root.unmount();
      document.body.removeChild(container);
      resolve(dataUrl);
    };

    requestAnimationFrame(() => requestAnimationFrame(finish));
  });
