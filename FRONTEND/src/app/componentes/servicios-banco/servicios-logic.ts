export function iniciarServicios(): void {
  const providerLabel = document.getElementById('providerLabel') as HTMLElement;
  const serviceNumberInput = document.getElementById('serviceNumberInput') as HTMLInputElement;
  const serviceTypeInput = document.getElementById('serviceTypeInput') as HTMLInputElement;
  const amountInput = document.getElementById('amountInput') as HTMLInputElement;
  const summaryAmount = document.getElementById('summaryAmount') as HTMLElement;
  const summaryFee = document.getElementById('summaryFee') as HTMLElement;
  const summaryTotal = document.getElementById('summaryTotal') as HTMLElement;
  const successMessage = document.getElementById('successMessage') as HTMLElement;
  const confirmBtn = document.getElementById('confirmBtn') as HTMLElement;
  const cancelBtn = document.getElementById('cancelBtn') as HTMLElement;
  const backHomeBtn = document.getElementById('backHomeBtn') as HTMLElement;
  const successModal = document.getElementById('successModal') as HTMLElement;
  const quickServiceBtn = document.getElementById('quickServiceBtn') as HTMLElement;
  const changeServiceBtn = document.getElementById('changeServiceBtn') as HTMLElement;

  const providers: string[] = ['Edenor', 'Gas Natural', 'Telecom', 'Aysa'];

  const formatCurrency = (value: number | string | null | undefined): string => {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const updateSummary = (): void => {
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
    const currentIndex = providers.indexOf((providerLabel.textContent ?? '').trim());
    const nextIndex = (currentIndex + 1) % providers.length;
    const nextProvider = providers[nextIndex];
    providerLabel.textContent = nextProvider;

    const defaultNumbers: Record<string, string> = {
      Edenor: '4598123',
      'Gas Natural': '8302456',
      Telecom: '2214870',
      Aysa: '6549981'
    };

    const defaultConcepts: Record<string, string> = {
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
    const provider = (providerLabel.textContent ?? '').trim();

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
}