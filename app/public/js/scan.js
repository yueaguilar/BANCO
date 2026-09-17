document.addEventListener('DOMContentLoaded', () => {
  const qrRegionId = 'qr-reader';
  const stopBtn = document.getElementById('stopBtn');
  const scanResult = document.getElementById('scanResult');
  const decodedTextEl = document.getElementById('decodedText');

  let html5QrCode;

  const onScanSuccess = (decodedText, decodedResult) => {
    // stop camera and processing
    if (html5QrCode) {
      html5QrCode.stop().then(() => {
        html5QrCode.clear();
      }).catch(() => {});
    }

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

  const onScanFailure = (error) => {
    // Ignorar errores intermedios de lectura
  };

  // Start camera
  if (window.Html5Qrcode) {
    html5QrCode = new Html5Qrcode(qrRegionId);
    const config = { fps: 10, qrbox: 250 };
    Html5Qrcode.getCameras().then(cameras => {
      const cameraId = cameras && cameras.length ? cameras[0].id : null;
      html5QrCode.start(
        cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
        config,
        onScanSuccess,
        onScanFailure
      ).catch(err => {
        console.error('No se pudo iniciar la cámara:', err);
        alert('No se pudo acceder a la cámara. Verificá permisos y volvé a intentarlo.');
      });
    }).catch(err => {
      console.error('No se encontraron cámaras:', err);
      alert('No se encontró ninguna cámara disponible en este dispositivo.');
    });
  } else {
    alert('El escáner no está disponible en este navegador.');
  }

  stopBtn.addEventListener('click', () => {
    if (html5QrCode) {
      html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
    }
    window.location.href = 'transferir.html';
  });
});
