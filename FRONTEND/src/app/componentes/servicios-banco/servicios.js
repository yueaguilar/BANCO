document.addEventListener('DOMContentLoaded', () => {
  const providerLabel = document.getElementById('providerLabel');
  const serviceNumberInput = document.getElementById('serviceNumberInput');
  const serviceTypeInput = document.getElementById('serviceTypeInput');
  const amountInput = document.getElementById('amountInput');
  const summaryAmount = document.getElementById('summaryAmount');
  const summaryFee = document.getElementById('summaryFee');
  const summaryTotal = document.getElementById('summaryTotal');
  const successMessage = document.getElementById('successMessage');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const backHomeBtn = document.getElementById('backHomeBtn');
  const successModal = document.getElementById('successModal');
  const quickServiceBtn = document.getElementById('quickServiceBtn');
  const changeServiceBtn = document.getElementById('changeServiceBtn');

  const providers = ['Edenor', 'Gas Natural', 'Telecom', 'Aysa'];

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
    const commission = rawAmount > 2000 ? 15 : 0;
    const total = rawAmount + commission;

    summaryAmount.textContent = formatCurrency(rawAmount);
    summaryFee.textContent = formatCurrency(commission);
    summaryTotal.textContent = formatCurrency(total);
  };

  amountInput.addEventListener('input', updateSummary);

  quickServiceBtn.addEventListener('click', () => {
    providerLabel.textContent = 'Edenor';
    serviceNumberInput.value = '4598123';
    serviceTypeInput.value = 'Factura de luz';
    amountInput.value = '2450';
    updateSummary();
  });

  changeServiceBtn.addEventListener('click', () => {
    const currentIndex = providers.indexOf(providerLabel.textContent.trim());
    const nextIndex = (currentIndex + 1) % providers.length;
    const nextProvider = providers[nextIndex];
    providerLabel.textContent = nextProvider;

    const defaultNumbers = {
      Edenor: '4598123',
      'Gas Natural': '8302456',
      Telecom: '2214870',
      Aysa: '6549981'
    };

    const defaultConcepts = {
      Edenor: 'Factura de luz',
      'Gas Natural': 'Servicio de gas',
      Telecom: 'Internet y telefonía',
      Aysa: 'Cobro de agua'
    };

    serviceNumberInput.value = defaultNumbers[nextProvider] || '123456';
    serviceTypeInput.value = defaultConcepts[nextProvider] || 'Pago de servicio';
  });

  cancelBtn.addEventListener('click', () => {
    window.location.href = 'app.html';
  });

  confirmBtn.addEventListener('click', () => {
    const rawAmount = Number(amountInput.value || 0);
    const serviceNumber = serviceNumberInput.value.trim();
    const provider = providerLabel.textContent.trim();

    if (!rawAmount || rawAmount <= 0 || !serviceNumber) {
      serviceNumberInput.focus();
      return;
    }

    successMessage.textContent = `Tu pago de ${formatCurrency(rawAmount)} a ${provider} fue realizado.`;
    successModal.classList.remove('hidden');
  });

  backHomeBtn.addEventListener('click', () => {
    window.location.href = 'app.html?service=success';
  });

  updateSummary();
});
