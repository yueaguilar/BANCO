export function iniciarPago(): () => void {
  const amountInput = document.getElementById('amountInput') as HTMLInputElement;
  const conceptInput = document.getElementById('conceptInput') as HTMLInputElement;
  const summaryAmount = document.getElementById('summaryAmount') as HTMLElement;
  const summaryFee = document.getElementById('summaryFee') as HTMLElement;
  const summaryTotal = document.getElementById('summaryTotal') as HTMLElement;
  const successMessage = document.getElementById('successMessage') as HTMLElement;
  const confirmBtn = document.getElementById('confirmBtn') as HTMLElement;
  const cancelBtn = document.getElementById('cancelBtn') as HTMLElement;
  const backHomeBtn = document.getElementById('backHomeBtn') as HTMLElement;
  const successModal = document.getElementById('successModal') as HTMLElement;
  const quickPayBtn = document.getElementById('quickPayBtn') as HTMLElement;
  const changeDestinyBtn = document.getElementById('changeDestinyBtn') as HTMLElement;
  const destinoLabel = document.getElementById('destinoLabel') as HTMLElement;

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
    const commission = rawAmount > 500 ? 12.5 : 0;
    const total = rawAmount + commission;

    summaryAmount.textContent = formatCurrency(rawAmount);
    summaryFee.textContent = formatCurrency(commission);
    summaryTotal.textContent = formatCurrency(total);
    successMessage.textContent = `Tu pago por ${formatCurrency(rawAmount)} fue confirmado.`;
  };

  amountInput.addEventListener('input', updateSummary);

  document.querySelectorAll<HTMLElement>('.method').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll<HTMLElement>('.method').forEach((el) => el.classList.remove('active'));
      button.classList.add('active');
    });
  });

  quickPayBtn.addEventListener('click', () => {
    amountInput.value = '';
    conceptInput.value = '';
    updateSummary();
  });

  changeDestinyBtn.addEventListener('click', () => {
    const destinations = ['Nuevo destino', 'Supermercado', 'Gasolinera', 'Servicio eléctrico', 'Colegio'];
    const currentIndex = destinations.indexOf((destinoLabel.textContent ?? '').trim());
    const nextIndex = (currentIndex + 1) % destinations.length;
    destinoLabel.textContent = destinations[nextIndex];
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

    const selectedMethod = document.querySelector<HTMLElement>('.method.active')?.dataset['method'] || 'saldo';
    successMessage.textContent = `Tu pago por ${formatCurrency(rawAmount)} fue confirmado con ${selectedMethod}.`;
    successModal.classList.remove('hidden');
  });

  backHomeBtn.addEventListener('click', () => {
    window.location.href = 'app.html?payment=success';
  });

  let limpiar = (): void => {};

  const nav = document.querySelector<HTMLElement>('.bottom-nav');
  const indicator = nav?.querySelector<HTMLElement>('.nav-indicator');
  const items = Array.from(nav?.querySelectorAll<HTMLElement>('.nav-item') ?? []);

  if (nav && indicator && items.length) {
    const moveIndicator = (target: HTMLElement): void => {
      const navRect = nav.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      indicator.style.width = `${targetRect.width}px`;
      indicator.style.transform = `translateX(${targetRect.left - navRect.left}px)`;
    };

    const current = items.find((item) => item.classList.contains('active')) || items[0];
    moveIndicator(current);

    const onResize = (): void => {
      const active = document.querySelector<HTMLElement>('.nav-item.active') || items[0];
      moveIndicator(active);
    };
    window.addEventListener('resize', onResize);
    limpiar = () => window.removeEventListener('resize', onResize);

    items.forEach((item) => {
      item.addEventListener('click', () => {
        items.forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
        moveIndicator(item);
      });
    });
  }

  updateSummary();

  return limpiar;
}