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
  esIngreso,
  obtenerMovimientosBancarios,
  renderizarEstadoVacio,
  renderizarMovimiento
} from '../../services/movimientos.service';

export async function iniciarApp(): Promise<void> {
  const formatMoney = (value: number | string | null | undefined): string => new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(Number(value || 0));

  const getSession = async (): Promise<Session> => {
    let user: User | null = null;
    let bankData: BankData | null = null;
    const token = localStorage.getItem('sessionToken') || '';

    try {
      user = JSON.parse(localStorage.getItem('user') as string);
      bankData = JSON.parse(localStorage.getItem('bankData') as string);
    } catch (error) {
      user = null;
      bankData = null;
    }

    if (!token && !user?.email) {
      return { user: null, bankData: null };
    }

    if (token) {
      try {
        const response = await fetch(`${API_URL}/api/session`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data: SessionResponse = await response.json();
        if (response.ok && data.success) {
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('bankData', JSON.stringify(data.bankData));
          return { user: data.user, bankData: data.bankData };
        }
      } catch (error) {
        console.warn('No se pudo cargar la sesión desde la base de datos', error);
      }
    }

    return { user, bankData };
  };

  const session = await getSession();
  const bankData = session.bankData;

  const saldoEl = document.getElementById('saldoMovimientos');
  const ingresosEl = document.getElementById('ingresosTotal');
  const gastosEl = document.getElementById('gastosTotal');
  const movementList = document.getElementById('movementList');

  if (saldoEl) {
    saldoEl.textContent = bankData ? formatMoney(bankData.saldo) : '$0,00';
  }

  if (movementList) {
    if (!bankData) {
      movementList.innerHTML = `
        <li class="movement-item empty-state">
          <div class="movement-left">
            <span class="movement-icon transfer">-</span>
            <div>
              <strong>Sin movimientos aún</strong>
              <small>Inicia sesión para ver tu historial real</small>
            </div>
          </div>
          <div class="movement-right">
            <span class="amount">$0,00</span>
            <small>Hoy</small>
          </div>
        </li>
      `;
      return;
    }

    try {
      const token = localStorage.getItem('sessionToken') || '';
      const movements = await obtenerMovimientosBancarios(token);
      const income = movements
        .filter(esIngreso)
        .reduce((total, movement) => total + Number(movement.monto), 0);
      const expenses = movements
        .filter((movement) => !esIngreso(movement))
        .reduce((total, movement) => total + Number(movement.monto), 0);
      if (ingresosEl) ingresosEl.textContent = formatMoney(income);
      if (gastosEl) gastosEl.textContent = formatMoney(expenses);

      movementList.replaceChildren();
      for (const movement of movements) {
        movementList.append(renderizarMovimiento(movement, 'movimientos'));
      }

      if (movements.length === 0) {
        movementList.append(renderizarEstadoVacio('movimientos', 'Sin movimientos aún'));
      }
    } catch (error) {
      console.error('No se pudo cargar el historial bancario.', error);
      movementList.replaceChildren(
        renderizarEstadoVacio('movimientos', 'No se pudo actualizar el historial. Intenta de nuevo.')
      );
    }
  }
}