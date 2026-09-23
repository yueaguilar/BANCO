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
        const response = await fetch(`/api/session?email=${encodeURIComponent(user.email)}`);
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

  if (ingresosEl) {
    ingresosEl.textContent = '$0,00';
  }

  if (gastosEl) {
    gastosEl.textContent = '$0,00';
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

    movementList.innerHTML = `
      <li class="movement-item">
        <div class="movement-left">
          <span class="movement-icon income">C</span>
          <div>
            <strong>Cuenta</strong>
            <small>Saldo actual</small>
          </div>
        </div>
        <div class="movement-right">
          <span class="amount positive">${formatMoney(bankData.saldo)}</span>
          <small>Actual</small>
        </div>
      </li>
    `;
  }
}