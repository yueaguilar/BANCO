interface User {
  email: string;
  [key: string]: unknown;
}

interface BankData {
  saldo: number | string;
  [key: string]: unknown;
}

interface Session {
  user: User | null;
  bankData: BankData | null;
}

interface SessionResponse {
  success: boolean;
  user: User;
  bankData: BankData;
}
import { API_URL } from '../../api-config';
import {
  obtenerMovimientosBancarios,
  renderizarEstadoVacio,
  renderizarMovimiento,
  type MovimientoBancario
} from '../../services/movimientos.service';

// Interacciones principales: renderizado, modal y flujo de pago
export async function iniciarApp(): Promise<void> {

  const txList = document.getElementById('txList');
  const modal = document.getElementById('modal');
  const modalList = document.getElementById('modalList');
  const verTodas = document.getElementById('verTodas');
  const closeModal = document.getElementById('closeModal');
  const pagarBtn = document.getElementById('pagarBtn');
  const transferirBtn = document.getElementById('transferirBtn');
  const qrBtn = document.getElementById('qrBtn');
  const paymentToast = document.getElementById('paymentToast');

  const query = new URLSearchParams(window.location.search);

  if (
    query.get('payment') === 'success' ||
    query.get('transfer') === 'success' ||
    query.get('recharge') === 'success' ||
    query.get('service') === 'success'
  ) {
    if (paymentToast) {
      paymentToast.textContent =
        query.get('transfer') === 'success'
          ? 'Transferencia realizada con éxito'
          : query.get('recharge') === 'success'
            ? 'Recarga realizada con éxito'
            : query.get('service') === 'success'
              ? 'Servicio pagado con éxito'
              : 'Pago realizado con éxito';

      paymentToast.classList.remove('hidden');

      setTimeout(() => {
        paymentToast.classList.add('hidden');
      }, 2600);
    }

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }

  const formatMoney = (
    value: number | string | null | undefined
  ): string =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS'
    }).format(Number(value || 0));

  const loadSession = async (): Promise<Session> => {

    let parsedUser: User | null = null;
    let parsedBank: BankData | null = null;
    const token = localStorage.getItem('sessionToken') || '';

    try {
      const storedUser = localStorage.getItem('user');
      const storedBank = localStorage.getItem('bankData');

      parsedUser = storedUser
        ? JSON.parse(storedUser) as User
        : null;

      parsedBank = storedBank
        ? JSON.parse(storedBank) as BankData
        : null;

    } catch (error) {
      parsedUser = null;
      parsedBank = null;
    }

    if (!token) {
      return {
        user: null,
        bankData: null
      };
    }

    if (token) {

      try {

        const response = await fetch(`${API_URL}/api/session`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json() as SessionResponse;

        if (response.ok && data.success) {

          localStorage.setItem(
            'user',
            JSON.stringify(data.user)
          );

          localStorage.setItem(
            'bankData',
            JSON.stringify(data.bankData)
          );

          return {
            user: data.user,
            bankData: data.bankData
          };
        }

      } catch (error) {

        console.warn(
          'No se pudo actualizar la sesión desde la base de datos',
          error
        );

      }
    }

    return {
      user: parsedUser,
      bankData: parsedBank
    };
  };

  let transactions: MovimientoBancario[] = [];
  let bankData: BankData | null = null;

  const session = await loadSession();

  bankData = session.bankData;

  const balanceEl = document.getElementById('balance');

  if (balanceEl) {
    balanceEl.textContent = bankData
      ? formatMoney(bankData.saldo)
      : 'Sin saldo disponible';
  }

  if (!bankData) {
    transactions = [];
  }

  const render = (
    listEl: HTMLElement | null,
    items: MovimientoBancario[],
    emptyMessage: string
  ): void => {
    if (!listEl) return;
    listEl.replaceChildren();

    if (!items.length) {
      listEl.append(renderizarEstadoVacio('home', emptyMessage));
      return;
    }

    items.forEach((movement) => {
      listEl.append(renderizarMovimiento(movement, 'home'));
    });
  };

  if (localStorage.getItem('sessionToken')) {
    try {
      transactions = await obtenerMovimientosBancarios(
        localStorage.getItem('sessionToken') || ''
      );
      render(txList, transactions.slice(0, 3), 'Sin movimientos aún');
    } catch (error) {
      console.error('No se pudo cargar el historial bancario.', error);
      render(txList, [], 'No se pudo actualizar el historial. Intenta de nuevo.');
    }
  } else {
    render(txList, [], 'Inicia sesión para ver tu historial real');
  }

  verTodas?.addEventListener('click', () => {

    render(modalList, transactions, 'Sin movimientos aún');

    modal?.classList.remove('hidden');
  });

  closeModal?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  pagarBtn?.addEventListener('click', () => {
    window.location.href = '/pago';
  });

  transferirBtn?.addEventListener('click', () => {
    window.location.href = '/transferir';
  });

  qrBtn?.addEventListener('click', () => {
    window.location.href = '/qr';
  });

  const recargarBtn = document.getElementById('recargarBtn');

  recargarBtn?.addEventListener('click', () => {
    window.location.href = '/recarga';
  });

  const serviciosBtn = document.getElementById('serviciosBtn');

  serviciosBtn?.addEventListener('click', () => {
    window.location.href = '/servicios';
  });
}