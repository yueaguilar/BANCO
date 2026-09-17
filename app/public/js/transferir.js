document.addEventListener('DOMContentLoaded', () => {
  const amountInput = document.getElementById('amountInput');
  const recipientInput = document.getElementById('recipientInput');
  const accountNumberInput = document.getElementById('accountNumberInput');
  const conceptInput = document.getElementById('conceptInput');
  const destinatarioLabel = document.getElementById('destinatarioLabel');
  const summaryAmount = document.getElementById('summaryAmount');
  const summaryFee = document.getElementById('summaryFee');
  const summaryTotal = document.getElementById('summaryTotal');
  const successMessage = document.getElementById('successMessage');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const backHomeBtn = document.getElementById('backHomeBtn');
  const successModal = document.getElementById('successModal');
  const quickTransferBtn = document.getElementById('quickTransferBtn');
  const changeContactBtn = document.getElementById('changeContactBtn');
  const qrShareBtn = document.getElementById('qrShareBtn');
  const scanQrBtn = document.getElementById('scanQrBtn');

  const formatCurrency = (value) => {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const updateSummary = () => {
    const rawAmount = Number(amountInput.value || 0);
    const commission = rawAmount > 5000 ? 12.5 : 0;
    const total = rawAmount + commission;

    summaryAmount.textContent = formatCurrency(rawAmount);
    summaryFee.textContent = formatCurrency(commission);
    summaryTotal.textContent = formatCurrency(total);
  };

  amountInput.addEventListener('input', updateSummary);

  quickTransferBtn?.addEventListener('click', () => {
    amountInput.value = '';
    recipientInput.value = '';
    accountNumberInput.value = '';
    conceptInput.value = '';
    destinatarioLabel.textContent = 'Nuevo destinatario';
    updateSummary();
  });

  qrShareBtn?.addEventListener('click', () => {
    const payload = {
      destinatario: destinatarioLabel.textContent.trim() || 'Destinatario',
      alias: recipientInput.value.trim() || '',
      cuenta: accountNumberInput.value.trim() || '',
      concepto: conceptInput.value.trim() || 'Transferencia',
      monto: Number(amountInput.value || 0),
      moneda: 'ARS'
    };

    const encoded = encodeURIComponent(JSON.stringify(payload));
    window.location.href = `qr.html?data=${encoded}`;
  });

  scanQrBtn?.addEventListener('click', () => {
    window.location.href = 'scan.html';
  });

  const urlParams = new URLSearchParams(window.location.search);
  const preloaded = urlParams.get('data');
  if (preloaded) {
    try {
      const parsed = JSON.parse(decodeURIComponent(preloaded));
      if (parsed.monto) amountInput.value = String(parsed.monto);
      if (parsed.alias) recipientInput.value = parsed.alias;
      if (parsed.cuenta) accountNumberInput.value = parsed.cuenta;
      if (parsed.concepto) conceptInput.value = parsed.concepto;
      if (parsed.destinatario) destinatarioLabel.textContent = parsed.destinatario;
      updateSummary();
    } catch (err) {
      console.error('No se pudo leer datos pre cargados:', err);
    }
  }

  changeContactBtn?.addEventListener('click', () => {
    destinatarioLabel.textContent = 'Nuevo destinatario';
    recipientInput.value = '';
    accountNumberInput.value = '';
  });

  cancelBtn.addEventListener('click', () => {
    window.location.href = 'app.html';
  });

  confirmBtn.addEventListener('click', () => {
    const rawAmount = Number(amountInput.value || 0);
    if (!rawAmount || rawAmount <= 0) {
      amountInput.focus();
      return;
    }

    const contactName = destinatarioLabel.textContent.trim() || 'destinatario';
    successMessage.textContent = `Tu transferencia de ${formatCurrency(rawAmount)} fue enviada a ${contactName}.`;
    successModal.classList.remove('hidden');
  });

  backHomeBtn.addEventListener('click', () => {
    window.location.href = 'app.html?transfer=success';
  });

  updateSummary();
});
