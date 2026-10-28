interface User {
  email?: string;
  fullname?: string;
  [key: string]: unknown;
}

interface BankData {
  saldo?: number | string;
  numeroCuenta?: number | string;
  mesExpiracion?: number | string;
  anioExpiracion?: number | string;
  numeroTarjeta?: number | string;
  [key: string]: unknown;
}

interface SessionData {
  user: User | null;
  bankData: BankData | null;
  success?: boolean;
}
import { API_URL } from '../../api-config';
import {
  esIngreso,
  obtenerMovimientosBancarios,
  renderizarEstadoVacio,
  renderizarMovimiento,
  type MovimientoBancario
} from '../../services/movimientos.service';

export async function iniciarApp(): Promise<() => void> {
  let countdownInterval: ReturnType<typeof setInterval> | undefined;

  const formatMoney = (
    value: number | string | null | undefined
  ): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS'
    }).format(Number(value || 0));
  };

  const readLocalSession = (): SessionData => {
    try {
      const storedUser = localStorage.getItem('user');
      const storedBankData = localStorage.getItem('bankData');

      const bankData = storedBankData
        ? JSON.parse(storedBankData) as BankData
        : null;

      if (bankData && 'nip' in bankData) {
        delete bankData['nip'];
        localStorage.setItem('bankData', JSON.stringify(bankData));
      }

      return {
        user: storedUser
          ? JSON.parse(storedUser) as User
          : null,

        bankData
      };

    } catch (error) {
      console.warn(
        'No se pudo leer la sesión local',
        error
      );

      return {
        user: null,
        bankData: null
      };
    }
  };

  // Pide la sesión al servidor con tiempo límite
  // para evitar que la página se quede en "Cargando..."

  const fetchSession = async (
    token: string
  ): Promise<SessionData | null> => {

    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, 8000);

    try {

      const response = await fetch(`${API_URL}/api/session`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });

      const data = await response.json() as SessionData;

      if (response.ok && data.success) {
        return data;
      }

    } catch (error) {

      console.warn(
        'No se pudo obtener la sesión activa',
        error
      );

    } finally {

      clearTimeout(timer);
    }

    return null;
  };

  const render = (
    user: User | null,
    bankData: BankData | null
  ): void => {

    const profileNameEl =
      document.querySelector<HTMLElement>(
        '.profile-meta h2'
      );

    if (profileNameEl) {
      profileNameEl.textContent =
        user?.fullname || 'Usuario';
    }

    const balanceEl =
      document.querySelector<HTMLElement>(
        '.main-card .balance'
      );

    if (balanceEl) {
      balanceEl.textContent = bankData
        ? formatMoney(bankData.saldo)
        : 'Sin saldo disponible';
    }

    const accountStrong =
      document.getElementById(
        'accountNumberDisplay'
      );

    if (
      accountStrong &&
      bankData?.numeroCuenta
    ) {

      const num =
        String(bankData.numeroCuenta);

      accountStrong.textContent = num;
    }

    const nipStrong = document.getElementById('nipDisplay');
    if (nipStrong) nipStrong.textContent = '****';

    // Panel "Ver detalle"

    const setText = (
      id: string,
      text: string
    ): void => {

      const el =
        document.getElementById(id);

      if (el) {
        el.textContent = text;
      }
    };

    setText(
      'detailHolder',
      user?.fullname || 'Usuario'
    );

    setText(
      'detailAccount',
      bankData?.numeroCuenta
        ? String(bankData.numeroCuenta)
        : 'No disponible'
    );

    setText('detailNip', '****');

    setText(
      'detailExpiry',
      bankData?.mesExpiracion &&
      bankData?.anioExpiracion
        ? `${String(bankData.mesExpiracion).padStart(2, '0')}/${String(bankData.anioExpiracion).slice(-2)}`
        : '--/--'
    );

    const cardStrong =
      document.querySelector<HTMLElement>(
        '.credit-card strong'
      );

    const cardBottomSpans =
      document.querySelectorAll<HTMLSpanElement>(
        '.credit-card .card-bottom span'
      );

    if (cardStrong) {
      numeroTarjetaActual = bankData?.numeroTarjeta
        ? String(bankData.numeroTarjeta)
        : '';
      cardStrong.textContent = numeroTarjetaActual
        ? `•••• •••• •••• ${numeroTarjetaActual.slice(-4)}`
        : 'Tarjeta no disponible';
      const cardNumberButton = document.getElementById('toggleCardNumberBtn') as HTMLButtonElement | null;
      if (cardNumberButton) cardNumberButton.disabled = !numeroTarjetaActual;

      if (cardBottomSpans.length >= 2) {

        cardBottomSpans[0].textContent =
          user?.fullname || 'Titular';

        cardBottomSpans[1].textContent =
          `${String(bankData?.mesExpiracion || '').padStart(2, '0')}/${String(bankData?.anioExpiracion || '').slice(-2)}`;
      }
    }

    const main =
      document.querySelector<HTMLElement>('main');

    const oldNotice =
      document.querySelector<HTMLElement>(
        'main .notice'
      );

    if (oldNotice) {
      oldNotice.remove();
    }

    if (!bankData) {

      const warning =
        document.createElement('div');

      warning.className = 'notice';

      warning.textContent =
        'No hay datos de cuenta para esta sesión. Inicia sesión para ver información real.';

      if (main) {
        main.prepend(warning);
      }
    }
  };

  let numeroTarjetaActual = '';

  // ==========================================
  // MODAL "VER TODO"
  // ==========================================

  const modal =
    document.getElementById('modal');

  const modalList =
    document.getElementById('modalList');

  let accountMovements: MovimientoBancario[] = [];

  const openModalBtn =
    document.getElementById('verTodas');

  const closeModalBtn =
    document.getElementById('closeModal');

  const recargarBtn =
    document.getElementById('recargarBtn');

  if (recargarBtn) {

    recargarBtn.addEventListener(
      'click',
      () => {
        window.location.href =
          'recarga.html';
      }
    );
  }

  if (
    modal &&
    modalList &&
    openModalBtn
  ) {

    const openModal = (): void => {
      modalList.replaceChildren();
      if (accountMovements.length) {
        accountMovements.forEach((movement) => {
          modalList.append(renderizarMovimiento(movement, 'cuenta'));
        });
      } else {
        modalList.append(
          renderizarEstadoVacio('cuenta', 'Sin movimientos aún')
        );
      }
      modal.classList.remove('hidden');
    };

    const closeModal = (): void => {
      modal.classList.add('hidden');
    };

    openModalBtn.addEventListener(
      'click',
      openModal
    );

    if (closeModalBtn) {

      closeModalBtn.addEventListener(
        'click',
        closeModal
      );
    }

    modal.addEventListener(
      'click',
      (event: MouseEvent) => {
        if (event.target === modal) {
          closeModal();
        }
      }
    );

    document.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {

        if (event.key === 'Escape') {
          closeModal();
        }
      }
    );
  }

  const addCardModal = document.getElementById('addCardModal');
  const addCardButton = document.getElementById('addCardBtn');
  const closeAddCardButton = document.getElementById('closeAddCard');
  const openAddCardModal = (): void => addCardModal?.classList.remove('hidden');
  const closeAddCardModal = (): void => addCardModal?.classList.add('hidden');
  addCardButton?.addEventListener('click', openAddCardModal);
  closeAddCardButton?.addEventListener('click', closeAddCardModal);
  const closeAddCardBackdrop = (event: MouseEvent): void => {
    if (event.target === addCardModal) closeAddCardModal();
  };
  addCardModal?.addEventListener('click', closeAddCardBackdrop);

  const toggleCardNumberButton = document.getElementById('toggleCardNumberBtn');
  const cardNumberDisplay = document.getElementById('cardNumberDisplay');
  let mostrarNumeroTarjeta = false;
  const toggleCardNumber = (): void => {
    if (!cardNumberDisplay || !numeroTarjetaActual) return;
    mostrarNumeroTarjeta = !mostrarNumeroTarjeta;
    cardNumberDisplay.textContent = mostrarNumeroTarjeta
      ? numeroTarjetaActual.replace(/(.{4})/g, '$1 ').trim()
      : `•••• •••• •••• ${numeroTarjetaActual.slice(-4)}`;
    toggleCardNumberButton?.setAttribute('aria-pressed', String(mostrarNumeroTarjeta));
    if (toggleCardNumberButton) {
      toggleCardNumberButton.textContent = mostrarNumeroTarjeta
        ? 'Ocultar número'
        : 'Mostrar número';
    }
  };
  toggleCardNumberButton?.addEventListener('click', toggleCardNumber);

  const receiveModal = document.getElementById('receiveInstructionsModal');
  const receiveButton = document.getElementById('receiveMoneyBtn');
  const closeReceiveButton = document.getElementById('closeReceiveInstructions');
  const openReceiveModal = (): void => receiveModal?.classList.remove('hidden');
  const closeReceiveModal = (): void => receiveModal?.classList.add('hidden');
  receiveButton?.addEventListener('click', openReceiveModal);
  closeReceiveButton?.addEventListener('click', closeReceiveModal);
  const closeReceiveBackdrop = (event: MouseEvent): void => {
    if (event.target === receiveModal) closeReceiveModal();
  };
  receiveModal?.addEventListener('click', closeReceiveBackdrop);

  const sendMoneyButton = document.getElementById('sendMoneyBtn');
  const sendMoney = (): void => {
    window.location.href = '/transferir';
  };
  sendMoneyButton?.addEventListener('click', sendMoney);

  const loadAccountMovements = async (): Promise<void> => {
    const list = document.getElementById('transactionList');
    const token = localStorage.getItem('sessionToken') || '';
    if (!list) return;
    if (!token) {
      list.replaceChildren(
        renderizarEstadoVacio('cuenta', 'Inicia sesión para ver tu historial real')
      );
      return;
    }

    try {
      accountMovements = await obtenerMovimientosBancarios(token);
      list.replaceChildren();
      if (accountMovements.length) {
        accountMovements.slice(0, 3).forEach((movement) => {
          list.append(renderizarMovimiento(movement, 'cuenta'));
        });
      } else {
        list.append(renderizarEstadoVacio('cuenta', 'Sin movimientos aún'));
      }

      const currentMonthMovements = accountMovements.filter((movement) => {
        const date = new Date(movement.created_at);
        const now = new Date();
        return date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth();
      });
      const income = currentMonthMovements
        .filter(esIngreso)
        .reduce((total, movement) => total + Number(movement.monto), 0);
      const expenses = currentMonthMovements
        .filter((movement) => !esIngreso(movement))
        .reduce((total, movement) => total + Number(movement.monto), 0);
      const formatSummary = (value: number): string =>
        new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
      const incomeEl = document.querySelector<HTMLElement>('.summary-grid .positive');
      const expenseEl = document.querySelector<HTMLElement>('.summary-grid .negative');
      if (incomeEl) incomeEl.textContent = formatSummary(income);
      if (expenseEl) expenseEl.textContent = formatSummary(expenses);
    } catch (error) {
      console.error('No se pudo cargar el historial bancario.', error);
      list.replaceChildren(
        renderizarEstadoVacio(
          'cuenta',
          'No se pudo actualizar el historial. Intenta de nuevo.'
        )
      );
    }
  };

  // ==========================================
  // PANEL "VER DETALLE"
  // ==========================================

  const detailModal =
    document.getElementById(
      'detailModal'
    );

  const openDetailBtn =
    document.getElementById(
      'verDetalle'
    );

  const closeDetailBtn =
    document.getElementById(
      'closeDetail'
    );

  if (
    detailModal &&
    openDetailBtn
  ) {

    const openDetail = (): void => {
      detailModal.classList.remove(
        'hidden'
      );
    };

    const closeDetail = (): void => {
      detailModal.classList.add(
        'hidden'
      );
    };

    openDetailBtn.addEventListener(
      'click',
      openDetail
    );

    if (closeDetailBtn) {

      closeDetailBtn.addEventListener(
        'click',
        closeDetail
      );
    }

    detailModal.addEventListener(
      'click',
      (event: MouseEvent) => {

        if (
          event.target === detailModal
        ) {
          closeDetail();
        }
      }
    );

    document.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {

        if (event.key === 'Escape') {
          closeDetail();
        }
      }
    );
  }

  const temporaryNipModal =
    document.getElementById('temporaryNipModal');
  const temporaryNipForm =
    document.getElementById('temporaryNipForm') as HTMLFormElement | null;
  const temporaryNipOpen =
    document.getElementById('consultTemporaryNip');
  const temporaryNipClose =
    document.getElementById('closeTemporaryNip');
  const temporaryNipCancel =
    document.getElementById('cancelTemporaryNip');
  const temporaryNipPassword =
    document.getElementById('temporaryNipPassword') as HTMLInputElement | null;
  const temporaryNipError =
    document.getElementById('temporaryNipError');
  const temporaryNipResult =
    document.getElementById('temporaryNipResult');
  const temporaryNipCode =
    document.getElementById('temporaryNipCode');
  const temporaryNipCountdown =
    document.getElementById('temporaryNipCountdown');
  const temporaryNipConfirm =
    document.getElementById('confirmTemporaryNip') as HTMLButtonElement | null;
  let temporaryNipExpiresAt = 0;
  let temporaryNipRequestController: AbortController | null = null;

  const stopCountdown = (): void => {
    if (countdownInterval !== undefined) {
      clearInterval(countdownInterval);
      countdownInterval = undefined;
    }
  };

  const clearTemporaryNip = (expired = false): void => {
    stopCountdown();
    temporaryNipExpiresAt = 0;
    if (temporaryNipCode) temporaryNipCode.textContent = '****';
    if (temporaryNipResult) temporaryNipResult.hidden = true;
    if (temporaryNipCountdown) temporaryNipCountdown.textContent = '05:00';
    if (expired && temporaryNipError) {
      temporaryNipError.textContent = 'El NIP temporal expiró.';
      temporaryNipError.hidden = false;
    }
  };

  const closeTemporaryNipModal = (): void => {
    temporaryNipRequestController?.abort();
    temporaryNipRequestController = null;
    clearTemporaryNip();
    if (temporaryNipModal) temporaryNipModal.classList.add('hidden');
    if (temporaryNipPassword) temporaryNipPassword.value = '';
    if (temporaryNipError) temporaryNipError.hidden = true;
  };

  const displayTemporaryNip = (
    code: string,
    durationSeconds: number,
    sessionToken: string
  ): void => {
    clearTemporaryNip();
    if (!temporaryNipCode || !temporaryNipResult || !temporaryNipCountdown) return;

    temporaryNipCode.textContent = code;
    temporaryNipResult.hidden = false;
    temporaryNipExpiresAt = Date.now() + durationSeconds * 1000;
    const updateCountdown = (): void => {
      if (localStorage.getItem('sessionToken') !== sessionToken) {
        closeTemporaryNipModal();
        return;
      }

      const remainingSeconds = Math.max(
        0,
        Math.ceil((temporaryNipExpiresAt - Date.now()) / 1000)
      );
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      temporaryNipCountdown.textContent =
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (remainingSeconds === 0) clearTemporaryNip(true);
    };

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
  };

  const showTemporaryNipError = (message: string): void => {
    if (temporaryNipError) {
      temporaryNipError.textContent = message;
      temporaryNipError.hidden = false;
    }
  };

  const openTemporaryNipModal = (): void => {
    clearTemporaryNip();
    if (temporaryNipError) temporaryNipError.hidden = true;
    if (temporaryNipModal) temporaryNipModal.classList.remove('hidden');
    temporaryNipPassword?.focus();
  };

  const submitTemporaryNip = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!temporaryNipPassword || !temporaryNipConfirm) return;

    const token = localStorage.getItem('sessionToken') || '';
    if (!token) {
      showTemporaryNipError('Tu sesión no es válida. Inicia sesión nuevamente.');
      return;
    }

    if (temporaryNipError) temporaryNipError.hidden = true;
    temporaryNipConfirm.disabled = true;
    const controller = new AbortController();
    temporaryNipRequestController = controller;
    try {
      const response = await fetch(`${API_URL}/api/account/temporary-nip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({ password: temporaryNipPassword.value })
      });
      const data = await response.json() as {
        success?: boolean;
        message?: string;
        code?: string;
        expiresInSeconds?: number;
      };

      if (!response.ok || !data.success) {
        showTemporaryNipError(data.message || 'No se pudo consultar el NIP temporal.');
        return;
      }

      if (
        typeof data.code !== 'string' ||
        !/^\d{4}$/.test(data.code) ||
        typeof data.expiresInSeconds !== 'number' ||
        !Number.isFinite(data.expiresInSeconds)
      ) {
        showTemporaryNipError('El servidor devolvió una respuesta inválida.');
        return;
      }

      if (
        controller.signal.aborted ||
        !temporaryNipModal ||
        temporaryNipModal.classList.contains('hidden')
      ) {
        return;
      }
      if (localStorage.getItem('sessionToken') !== token) {
        closeTemporaryNipModal();
        return;
      }

      temporaryNipPassword.value = '';
      displayTemporaryNip(data.code, Math.min(data.expiresInSeconds!, 300), token);
    } catch {
      if (!controller.signal.aborted) {
        showTemporaryNipError('No se pudo conectar con el servidor. Inténtalo nuevamente.');
      }
    } finally {
      if (temporaryNipRequestController === controller) {
        temporaryNipRequestController = null;
      }
      temporaryNipConfirm.disabled = false;
    }
  };

  temporaryNipOpen?.addEventListener('click', openTemporaryNipModal);
  temporaryNipClose?.addEventListener('click', closeTemporaryNipModal);
  temporaryNipCancel?.addEventListener('click', closeTemporaryNipModal);
  const handleTemporaryNipSubmit = (event: SubmitEvent): void => {
    void submitTemporaryNip(event);
  };
  temporaryNipForm?.addEventListener('submit', handleTemporaryNipSubmit);
  const handleTemporaryNipBackdrop = (event: MouseEvent): void => {
    if (event.target === temporaryNipModal) closeTemporaryNipModal();
  };
  temporaryNipModal?.addEventListener('click', handleTemporaryNipBackdrop);
  const handleTemporaryNipEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && temporaryNipModal && !temporaryNipModal.classList.contains('hidden')) {
      closeTemporaryNipModal();
    }
  };
  const handleSessionStorageChange = (event: StorageEvent): void => {
    if (event.key === 'sessionToken' && event.newValue !== event.oldValue) {
      closeTemporaryNipModal();
    }
  };
  const handleUtilityModalEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    closeAddCardModal();
    closeReceiveModal();
  };
  document.addEventListener('keydown', handleTemporaryNipEscape);
  document.addEventListener('keydown', handleUtilityModalEscape);
  window.addEventListener('storage', handleSessionStorageChange);

  const cleanup = (): void => {
    closeTemporaryNipModal();
    temporaryNipOpen?.removeEventListener('click', openTemporaryNipModal);
    temporaryNipClose?.removeEventListener('click', closeTemporaryNipModal);
    temporaryNipCancel?.removeEventListener('click', closeTemporaryNipModal);
    temporaryNipForm?.removeEventListener('submit', handleTemporaryNipSubmit);
    temporaryNipModal?.removeEventListener('click', handleTemporaryNipBackdrop);
    document.removeEventListener('keydown', handleTemporaryNipEscape);
    document.removeEventListener('keydown', handleUtilityModalEscape);
    window.removeEventListener('storage', handleSessionStorageChange);
    addCardButton?.removeEventListener('click', openAddCardModal);
    closeAddCardButton?.removeEventListener('click', closeAddCardModal);
    addCardModal?.removeEventListener('click', closeAddCardBackdrop);
    toggleCardNumberButton?.removeEventListener('click', toggleCardNumber);
    receiveButton?.removeEventListener('click', openReceiveModal);
    closeReceiveButton?.removeEventListener('click', closeReceiveModal);
    receiveModal?.removeEventListener('click', closeReceiveBackdrop);
    sendMoneyButton?.removeEventListener('click', sendMoney);
  };

  // ==========================================
  // SESIÓN
  // ==========================================

  const local =
    readLocalSession();

  const token = localStorage.getItem('sessionToken') || '';
  const needsFetch = Boolean(token);

  if (!needsFetch) {

    render(
      local.user,
      local.bankData
    );

    await loadAccountMovements();
    return cleanup;
  }

  const data =
    await fetchSession(token);

  if (data) {

    try {

      localStorage.setItem(
        'user',
        JSON.stringify(data.user)
      );

      localStorage.setItem(
        'bankData',
        JSON.stringify(data.bankData)
      );

    } catch (error) {

      console.warn(
        'No se pudo guardar la sesión localmente',
        error
      );
    }

    render(
      data.user,
      data.bankData
    );

  } else {

    render(
      local.user,
      local.bankData
    );
  }

  await loadAccountMovements();
  return cleanup;
}