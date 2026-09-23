interface BankData {
  saldo: number | string;
  [key: string]: unknown;
}

interface Session {
  user: Record<string, unknown> | null;
  bankData: BankData | null;
}

interface Movement {
  title: string;
  amount: string;
  date: string;
}

interface ValidatedRecharge {
  phoneDigits: string;
  amount: number;
  carrier: string;
  total: number;
}

export function iniciarRecarga(): void {
  const formatCurrency = (value: number | string | null | undefined): string => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

  const readSession = (): Session => {
    try {
      const user = JSON.parse(localStorage.getItem('user') as string) || null;
      const bankData = JSON.parse(localStorage.getItem('bankData') as string) || null;
      return { user, bankData };
    } catch (error) {
      return { user: null, bankData: null };
    }
  };

  const setError = (message: string): void => {
    const errorBox = document.getElementById('errorBox');
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  };

  const clearError = (): void => {
    const errorBox = document.getElementById('errorBox');
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.classList.add('hidden');
    }
  };

  const phoneInput = document.getElementById('phoneInput') as HTMLInputElement;
  const amountInput = document.getElementById('amountInput') as HTMLInputElement;
  const summaryAmount = document.getElementById('summaryAmount');
  const summaryFee = document.getElementById('summaryFee');
  const summaryTotal = document.getElementById('summaryTotal');
  const balanceBadge = document.getElementById('balanceBadge');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const backBtn = document.getElementById('backBtn');
  const successModal = document.getElementById('successModal') as HTMLElement;
  const successMessage = document.getElementById('successMessage') as HTMLElement;
  const quickFillBtn = document.getElementById('quickFillBtn');

  const session = readSession();
  const currentBalance = Number(session.bankData?.saldo || 0);

  if (balanceBadge) {
    balanceBadge.textContent = `Saldo: ${formatCurrency(currentBalance)}`;
  }

  const updateSummary = (): void => {
    const amount = Number(amountInput?.value || 0);
    const fee = amount > 0 ? Math.max(10, amount * 0.015) : 0;
    const total = amount + fee;

    if (summaryAmount) summaryAmount.textContent = formatCurrency(amount);
    if (summaryFee) summaryFee.textContent = formatCurrency(fee);
    if (summaryTotal) summaryTotal.textContent = formatCurrency(total);

    if (balanceBadge) {
      const remaining = currentBalance - total;
      balanceBadge.textContent = `Saldo: ${formatCurrency(currentBalance)} · disponible ${formatCurrency(Math.max(remaining, 0))}`;
    }
  };

  const validateRecharge = (): ValidatedRecharge | null => {
    const phoneDigits = phoneInput.value.replace(/\D/g, '');
    const amount = Number(amountInput.value || 0);
    const carrier = document.querySelector<HTMLElement>('.carrier.selected')?.dataset['carrier'] || 'Personal';

    if (phoneDigits.length < 10) {
      setError('Ingresá un número de celular válido para continuar.');
      phoneInput.focus();
      return null;
    }

    if (!amount || amount <= 0) {
      setError('El monto de la recarga debe ser mayor a cero.');
      amountInput.focus();
      return null;
    }

    if (amount > currentBalance) {
      setError('No tenés saldo suficiente para completar esta recarga.');
      amountInput.focus();
      return null;
    }

    if (!carrier) {
      setError('Seleccioná un operador para continuar.');
      return null;
    }

    clearError();
    return { phoneDigits, amount, carrier, total: amount + Math.max(10, amount * 0.015) };
  };

  phoneInput?.addEventListener('input', () => {
    const digits = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    phoneInput.value = digits;
    clearError();
  });

  amountInput?.addEventListener('input', () => {
    const value = Number(amountInput.value || 0);
    if (value < 0) amountInput.value = '0';
    updateSummary();
    clearError();
  });

  document.querySelectorAll<HTMLElement>('.carrier').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll<HTMLElement>('.carrier').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      clearError();
    });
  });

  document.querySelectorAll<HTMLElement>('.amount-pill').forEach((button) => {
    button.addEventListener('click', () => {
      amountInput.value = button.dataset['amount'] || '0';
      updateSummary();
    });
  });

  quickFillBtn?.addEventListener('click', () => {
    phoneInput.value = '1123456789';
    amountInput.value = '1500';
    document.querySelectorAll<HTMLElement>('.carrier').forEach((button) => {
      button.classList.toggle('selected', button.dataset['carrier'] === 'Personal');
    });
    updateSummary();
    clearError();
  });

  cancelBtn?.addEventListener('click', () => {
    window.location.href = 'cuenta.html';
  });

  confirmBtn?.addEventListener('click', () => {
    const validated = validateRecharge();
    if (!validated) return;

    const nextBalance = currentBalance - validated.total;
    const updatedBankData = { ...session.bankData, saldo: Number(nextBalance.toFixed(2)) };

    try {
      localStorage.setItem('bankData', JSON.stringify(updatedBankData));

      const movement: Movement = {
        title: `Recarga ${validated.carrier}`,
        amount: `-${formatCurrency(validated.total)}`,
        date: new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      };

      const existingMovements: Movement[] = JSON.parse(localStorage.getItem('transactions') || '[]');
      localStorage.setItem('transactions', JSON.stringify([movement, ...existingMovements].slice(0, 12)));
    } catch (error) {
      console.warn('No se pudo guardar la recarga en localStorage', error);
    }

    successMessage.textContent = `Tu recarga de ${formatCurrency(validated.amount)} para ${validated.carrier} fue realizada correctamente. Total abonado ${formatCurrency(validated.total)}.`;
    successModal.classList.remove('hidden');
  });

  backBtn?.addEventListener('click', () => {
    window.location.href = 'cuenta.html';
  });

  updateSummary();
}