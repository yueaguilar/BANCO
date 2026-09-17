document.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('phoneInput');
  const phonePreview = document.getElementById('phonePreview');
  const amountInput = document.getElementById('amountInput');
  const summaryAmount = document.getElementById('summaryAmount');
  const summaryFee = document.getElementById('summaryFee');
  const summaryTotal = document.getElementById('summaryTotal');
  const successMessage = document.getElementById('successMessage');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const backHomeBtn = document.getElementById('backHomeBtn');
  const successModal = document.getElementById('successModal');
  const quickRechargeBtn = document.getElementById('quickRechargeBtn');
  const changeCarrierBtn = document.getElementById('changeCarrierBtn');

  const carriers = ['Personal', 'Claro', 'Movistar'];

  const formatCurrency = (value) => {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const updatePhonePreview = () => {
    const digits = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    phoneInput.value = digits;
    const formatted = digits.length >= 10
      ? `+54 11 ${digits.slice(2, 6)}-${digits.slice(6, 10)}`
      : digits.length >= 7
        ? `+54 11 ${digits.slice(2, 7)}`
        : digits.length > 0
          ? `+54 11 ${digits}`
          : '+54 11';
    phonePreview.textContent = formatted;
  };

  const updateSummary = () => {
    const rawAmount = Number(amountInput.value || 0);
    const commission = rawAmount > 1000 ? 15 : 0;
    const total = rawAmount + commission;

    summaryAmount.textContent = formatCurrency(rawAmount);
    summaryFee.textContent = formatCurrency(commission);
    summaryTotal.textContent = formatCurrency(total);
  };

  phoneInput.addEventListener('input', updatePhonePreview);
  amountInput.addEventListener('input', updateSummary);

  document.querySelectorAll('.carrier').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.carrier').forEach((el) => el.classList.remove('active'));
      button.classList.add('active');
    });
  });

  quickRechargeBtn.addEventListener('click', () => {
    phoneInput.value = '1123456789';
    document.querySelector('.carrier.active')?.classList.remove('active');
    const personalCarrier = [...document.querySelectorAll('.carrier')].find((button) => button.dataset.carrier === 'Personal');
    personalCarrier?.classList.add('active');
    amountInput.value = '1500';
    updatePhonePreview();
    updateSummary();
  });

  changeCarrierBtn.addEventListener('click', () => {
    const activeCarrier = document.querySelector('.carrier.active');
    const currentIndex = carriers.indexOf(activeCarrier?.dataset.carrier || 'Personal');
    const nextIndex = (currentIndex + 1) % carriers.length;

    document.querySelectorAll('.carrier').forEach((button) => button.classList.remove('active'));
    const nextCarrier = document.querySelector(`.carrier[data-carrier="${carriers[nextIndex]}"]`);
    nextCarrier?.classList.add('active');
  });

  cancelBtn.addEventListener('click', () => {
    window.location.href = 'app.html';
  });

  confirmBtn.addEventListener('click', () => {
    const rawAmount = Number(amountInput.value || 0);
    const phoneDigits = phoneInput.value.replace(/\D/g, '');
    const selectedCarrier = document.querySelector('.carrier.active')?.dataset.carrier || 'Personal';

    if (!rawAmount || rawAmount <= 0 || phoneDigits.length < 10) {
      phoneInput.focus();
      return;
    }

    successMessage.textContent = `Tu recarga de ${formatCurrency(rawAmount)} para ${selectedCarrier} fue realizada.`;
    successModal.classList.remove('hidden');
  });

  backHomeBtn.addEventListener('click', () => {
    window.location.href = 'app.html?recharge=success';
  });

  updatePhonePreview();
  updateSummary();
});
