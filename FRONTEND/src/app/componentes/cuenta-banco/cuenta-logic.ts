interface User {
  email?: string;
  fullname?: string;
  [key: string]: unknown;
}

interface BankData {
  saldo?: number | string;
  numeroCuenta?: number | string;
  nip?: number | string;
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

export async function iniciarApp(): Promise<void> {

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

      return {
        user: storedUser
          ? JSON.parse(storedUser) as User
          : null,

        bankData: storedBankData
          ? JSON.parse(storedBankData) as BankData
          : null
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
    email: string
  ): Promise<SessionData | null> => {

    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, 8000);

    try {

      const response = await fetch(
  `${API_URL}/api/session?email=${encodeURIComponent(email)}`,
  {
    signal: controller.signal
  }
);

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

    // El NIP solo se muestra si el servidor lo entregó.
    // En la BD solo existe el hash.

    const nipStrong =
      document.getElementById('nipDisplay');

    if (nipStrong) {

      nipStrong.textContent =
        bankData?.nip
          ? String(bankData.nip)
          : '****';
    }

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

    setText(
      'detailNip',
      bankData?.nip
        ? String(bankData.nip)
        : '****'
    );

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

    if (
      cardStrong &&
      bankData?.numeroTarjeta
    ) {

      const num =
        String(bankData.numeroTarjeta);

      cardStrong.textContent =
        '•••• ' + num.slice(-4);

      if (cardBottomSpans.length >= 2) {

        cardBottomSpans[0].textContent =
          user?.fullname || 'Titular';

        cardBottomSpans[1].textContent =
          `${String(bankData.mesExpiracion || '').padStart(2, '0')}/${String(bankData.anioExpiracion || '').slice(-2)}`;
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

  // ==========================================
  // MODAL "VER TODO"
  // ==========================================

  const modal =
    document.getElementById('modal');

  const modalList =
    document.getElementById('modalList');

  const sourceList =
    document.getElementById('transactionList');

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

      if (sourceList) {
        modalList.innerHTML =
          sourceList.innerHTML;
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

  // ==========================================
  // SESIÓN
  // ==========================================

  const local =
    readLocalSession();

  const needsFetch =
    Boolean(local.user?.email) &&
    !local.bankData;

  if (!needsFetch) {

    render(
      local.user,
      local.bankData
    );

    return;
  }

  const email = local.user?.email;

  if (!email) {

    render(
      local.user,
      local.bankData
    );

    return;
  }

  const data =
    await fetchSession(email);

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
}