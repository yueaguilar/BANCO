interface TransferPayload {
  type: string;
  destinatario: string;
  alias: string;
  cuenta: string;
  concepto: string;
  monto: number;
  moneda: string;
  createdAt: string;
}

interface PreloadedData {
  destinatario?: string;
  alias?: string;
  cuenta?: string;
  concepto?: string;
  monto?: number | string;
}

export function iniciarQr(): void {
  const form = document.getElementById('qrForm') as HTMLFormElement;
  const recipientName = document.getElementById('recipientName') as HTMLInputElement;
  const recipientAlias = document.getElementById('recipientAlias') as HTMLInputElement;
  const accountNumber = document.getElementById('accountNumber') as HTMLInputElement;
  const concept = document.getElementById('concept') as HTMLInputElement;
  const amount = document.getElementById('amount') as HTMLInputElement;
  const qrImage = document.getElementById('qrImage') as HTMLImageElement;
  const copyBtn = document.getElementById('copyBtn') as HTMLElement;
  const fillDemoBtn = document.getElementById('fillDemoBtn') as HTMLElement;
  const backBtn = document.getElementById('backBtn') as HTMLElement;

  const urlParams = new URLSearchParams(window.location.search);
  const preloadedData = urlParams.get('data');

  if (preloadedData) {
    try {
      const parsed: PreloadedData = JSON.parse(decodeURIComponent(preloadedData));
      if (parsed.destinatario) recipientName.value = parsed.destinatario;
      if (parsed.alias) recipientAlias.value = parsed.alias;
      if (parsed.cuenta) accountNumber.value = parsed.cuenta;
      if (parsed.concepto) concept.value = parsed.concepto;
      if (parsed.monto) amount.value = String(parsed.monto);
    } catch (error) {
      console.error('No se pudo leer el QR pre cargado:', error);
    }
  }

  let qrPayloadText = '';

  const buildTransferPayload = (): TransferPayload => {
    const payload: TransferPayload = {
      type: 'transferencia',
      destinatario: recipientName.value.trim() || 'Destinatario',
      alias: recipientAlias.value.trim() || '',
      cuenta: accountNumber.value.trim() || '',
      concepto: concept.value.trim() || 'Transferencia',
      monto: Number(amount.value || 0),
      moneda: 'ARS',
      createdAt: new Date().toISOString()
    };

    return payload;
  };

  const generateQrUrl = (payload: TransferPayload): string => {
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `https://quickchart.io/qr?text=${encoded}&size=300&ecLevel=H`;
  };

  const renderQr = (): TransferPayload => {
    const payload = buildTransferPayload();
    const qrUrl = generateQrUrl(payload);
    qrPayloadText = JSON.stringify(payload, null, 2);
    qrImage.src = qrUrl;
    qrImage.alt = 'QR de transferencia bancaria';
    return payload;
  };

  form.addEventListener('submit', (event: Event) => {
    event.preventDefault();

    const amountValue = Number(amount.value || 0);
    if (!amountValue || amountValue <= 0) {
      amount.focus();
      return;
    }

    if (!accountNumber.value.trim()) {
      accountNumber.focus();
      return;
    }

    renderQr();
    alert('QR generado correctamente para la transferencia.');
  });

  fillDemoBtn.addEventListener('click', () => {
    recipientName.value = '';
    recipientAlias.value = '';
    accountNumber.value = '';
    concept.value = '';
    amount.value = '';
    renderQr();
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(qrPayloadText);
      copyBtn.textContent = 'Copiado';
      setTimeout(() => {
        copyBtn.textContent = 'Copiar datos';
      }, 1200);
    } catch (error) {
      console.error('No se pudo copiar:', error);
      alert('No se pudo copiar el contenido del QR.');
    }
  });

  backBtn.addEventListener('click', () => {
    window.location.href = 'app.html';
  });

  renderQr();
}