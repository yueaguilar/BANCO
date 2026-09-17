document.addEventListener('DOMContentLoaded', () => {
  const amountInput = document.getElementById('amountInput');
  const conceptInput = document.getElementById('conceptInput');
  const summaryAmount = document.getElementById('summaryAmount');
  const summaryFee = document.getElementById('summaryFee');
  const summaryTotal = document.getElementById('summaryTotal');
  const successMessage = document.getElementById('successMessage');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const backHomeBtn = document.getElementById('backHomeBtn');
  const successModal = document.getElementById('successModal');
  const quickPayBtn = document.getElementById('quickPayBtn');
  const changeDestinyBtn = document.getElementById('changeDestinyBtn');
  const destinoLabel = document.getElementById('destinoLabel');

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
    const commission = rawAmount > 500 ? 12.5 : 0;
    const total = rawAmount + commission;

    summaryAmount.textContent = formatCurrency(rawAmount);
    summaryFee.textContent = formatCurrency(commission);
    summaryTotal.textContent = formatCurrency(total);
    successMessage.textContent = `Tu pago por ${formatCurrency(rawAmount)} fue confirmado.`;
  };

  amountInput.addEventListener('input', updateSummary);

  document.querySelectorAll('.method').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.method').forEach((el) => el.classList.remove('active'));
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
    const currentIndex = destinations.indexOf(destinoLabel.textContent.trim());
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

    const selectedMethod = document.querySelector('.method.active')?.dataset.method || 'saldo';
    successMessage.textContent = `Tu pago por ${formatCurrency(rawAmount)} fue confirmado con ${selectedMethod}.`;
    successModal.classList.remove('hidden');
  });

  backHomeBtn.addEventListener('click', () => {
    window.location.href = 'app.html?payment=success';
  });

  const nav = document.querySelector('.bottom-nav');
  const indicator = nav?.querySelector('.nav-indicator');
  const items = Array.from(nav?.querySelectorAll('.nav-item') || []);

  if (nav && indicator && items.length) {
    const moveIndicator = (target) => {
      const navRect = nav.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      indicator.style.width = `${targetRect.width}px`;
      indicator.style.transform = `translateX(${targetRect.left - navRect.left}px)`;
    };

    const current = items.find((item) => item.classList.contains('active')) || items[0];
    moveIndicator(current);

    window.addEventListener('resize', () => {
      const active = document.querySelector('.nav-item.active') || items[0];
      moveIndicator(active);
    });

    items.forEach((item) => {
      item.addEventListener('click', () => {
        items.forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
        moveIndicator(item);
      });
    });
  }

  updateSummary();
});
