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

  const contacts = ['Lucía García', 'Martín Pérez', 'Ana López', 'Florencia Gómez'];

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

  quickTransferBtn.addEventListener('click', () => {
    amountInput.value = '3200';
    recipientInput.value = 'lucia.garcia';
    accountNumberInput.value = '1234567890';
    conceptInput.value = 'Pago de alquiler';
    destinatarioLabel.textContent = 'Lucía García';
    updateSummary();
  });

  changeContactBtn.addEventListener('click', () => {
    const currentIndex = contacts.indexOf(destinatarioLabel.textContent.trim());
    const nextIndex = (currentIndex + 1) % contacts.length;
    const nextContact = contacts[nextIndex];
    destinatarioLabel.textContent = nextContact;
    recipientInput.value = nextContact.toLowerCase().replace(/\s+/g, '.');
    accountNumberInput.value = String(Math.floor(Math.random() * 9000000000) + 1000000000);
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
