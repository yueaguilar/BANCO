import { Html5Qrcode, Html5QrcodeResult } from 'html5-qrcode';

export function iniciarScan(): () => void {
  const qrRegionId = 'qr-reader';
  const stopBtn = document.getElementById('stopBtn') as HTMLElement;
  const scanResult = document.getElementById('scanResult') as HTMLElement;
  const decodedTextEl = document.getElementById('decodedText') as HTMLElement;

  let html5QrCode: Html5Qrcode | undefined;
  let destroyed = false;

  const stopCamera = (): void => {
    const scanner = html5QrCode;
    if (scanner) {
      scanner.stop().then(() => {
        scanner.clear();
      }).catch(() => {});
    }
  };

  const onScanSuccess = (decodedText: string, decodedResult: Html5QrcodeResult): void => {
    // stop camera and processing
    stopCamera();

    let jsonStr = decodedText;
    try {
      // If QR contains an encoded JSON string (encoded via encodeURIComponent)
      jsonStr = decodeURIComponent(decodedText);
    } catch (e) {
      // keep original
    }

    try {
      const payload = JSON.parse(jsonStr);
      // Redirect back to transferir page with encoded payload
      const encoded = encodeURIComponent(JSON.stringify(payload));
      window.location.href = `transferir.html?data=${encoded}`;
    } catch (err) {
      // show raw result
      decodedTextEl.textContent = decodedText;
      scanResult.classList.remove('hidden');
      alert('Se leyó un QR, pero no contiene datos de transferencia válidos.');
    }
  };

  const onScanFailure = (error: string): void => {
    // Ignorar errores intermedios de lectura
  };

  // Start camera
  const scanner = new Html5Qrcode(qrRegionId);
  html5QrCode = scanner;
  const config = { fps: 10, qrbox: 250 };

  Html5Qrcode.getCameras().then((cameras) => {
    const cameraId = cameras && cameras.length ? cameras[0].id : null;
    scanner.start(
      cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
      config,
      onScanSuccess,
      onScanFailure
    ).then(() => {
      // Si el componente se destruyó mientras la cámara arrancaba, se apaga
      if (destroyed) stopCamera();
    }).catch((err) => {
      console.error('No se pudo iniciar la cámara:', err);
      alert('No se pudo acceder a la cámara. Verificá permisos y volvé a intentarlo.');
    });
  }).catch((err) => {
    console.error('No se encontraron cámaras:', err);
    alert('No se encontró ninguna cámara disponible en este dispositivo.');
  });

  stopBtn.addEventListener('click', () => {
    stopCamera();
    window.location.href = 'transferir.html';
  });

  return () => {
    destroyed = true;
    stopCamera();
  };
}