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

interface Movement {
  id: number;
  tipo: string;
  monto: number | string;
  descripcion: string;
  created_at: string;
}

interface MovementResponse {
  success: boolean;
  data: Movement[];
}
import { API_URL } from '../../api-config';

export async function iniciarApp(): Promise<void> {
  const formatMoney = (value: number | string | null | undefined): string => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS'
  }).format(Number(value || 0));

  const getSession = async (): Promise<Session> => {
    let user: User | null = null;
    let bankData: BankData | null = null;

    try {
      user = JSON.parse(localStorage.getItem('user') as string);
      bankData = JSON.parse(localStorage.getItem('bankData') as string);
    } catch (error) {
      user = null;
      bankData = null;
    }

    if (!user?.email) {
      return { user: null, bankData: null };
    }

    if (!bankData) {
      try {
        const token = localStorage.getItem('sessionToken') || '';
        if (!token) return { user: null, bankData: null };
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

    const token = localStorage.getItem('sessionToken') || '';
    try {
      const response = await fetch(`${API_URL}/api/movimientos`, {
        headers: { Authorization: 'Bearer ' + token }
      });
      const result = await response.json() as MovementResponse;
      if (!response.ok || !result.success) {
        throw new Error('No se pudo actualizar el historial de movimientos.');
      }

      const movements = result.data;
      const income = movements
        .filter((movement) => movement.tipo.startsWith('deposito'))
        .reduce((total, movement) => total + Number(movement.monto), 0);
      const expenses = movements
        .filter((movement) => !movement.tipo.startsWith('deposito'))
        .reduce((total, movement) => total + Number(movement.monto), 0);
      if (ingresosEl) ingresosEl.textContent = formatMoney(income);
      if (gastosEl) gastosEl.textContent = formatMoney(expenses);

      movementList.replaceChildren();
      for (const movement of movements) {
        const isIncome = movement.tipo.startsWith('deposito');
        const item = document.createElement('li');
        item.className = 'movement-item';

        const left = document.createElement('div');
        left.className = 'movement-left';
        const icon = document.createElement('span');
        icon.className = `movement-icon ${isIncome ? 'income' : 'transfer'}`;
        icon.textContent = isIncome ? '+' : '-';
        const details = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = movement.descripcion;
        const type = document.createElement('small');
        type.textContent = movement.tipo;
        details.append(title, type);
        left.append(icon, details);

        const right = document.createElement('div');
        right.className = 'movement-right';
        const amount = document.createElement('span');
        amount.className = `amount ${isIncome ? 'positive' : ''}`;
        amount.textContent = `${isIncome ? '+' : '-'}${formatMoney(movement.monto)}`;
        const date = document.createElement('small');
        date.textContent = new Date(movement.created_at).toLocaleString('es-MX');
        right.append(amount, date);
        item.append(left, right);
        movementList.append(item);
      }

      if (movements.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'movement-item empty-state';
        empty.textContent = 'Sin movimientos aún';
        movementList.append(empty);
      }
    } catch (error) {
      console.error('No se pudo cargar el historial bancario.', error);
      movementList.textContent = 'No se pudo actualizar el historial. Intenta de nuevo.';
    }
  }
}