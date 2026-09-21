// Interacciones principales: renderizado, modal y flujo de pago
document.addEventListener('DOMContentLoaded', async () => {
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
  if (query.get('payment') === 'success' || query.get('transfer') === 'success' || query.get('recharge') === 'success' || query.get('service') === 'success') {
    paymentToast.textContent = query.get('transfer') === 'success'
      ? 'Transferencia realizada con éxito'
      : query.get('recharge') === 'success'
        ? 'Recarga realizada con éxito'
        : query.get('service') === 'success'
          ? 'Servicio pagado con éxito'
          : 'Pago realizado con éxito';
    paymentToast?.classList.remove('hidden');
    setTimeout(() => paymentToast?.classList.add('hidden'), 2600);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS'
  }).format(Number(value || 0));

  const loadSession = async () => {
    let parsedUser = null;
    let parsedBank = null;

    try {
      parsedUser = JSON.parse(localStorage.getItem('user'));
      parsedBank = JSON.parse(localStorage.getItem('bankData'));
    } catch (error) {
      parsedUser = null;
      parsedBank = null;
    }

    if (!parsedUser?.email) {
      return { user: null, bankData: null };
    }

    if (!parsedBank) {
      try {
        const response = await fetch(`/api/session?email=${encodeURIComponent(parsedUser.email)}`);
        const data = await response.json();
        if (response.ok && data.success) {
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('bankData', JSON.stringify(data.bankData));
          return { user: data.user, bankData: data.bankData };
        }
      } catch (error) {
        console.warn('No se pudo actualizar la sesión desde la base de datos', error);
      }
    }

    return { user: parsedUser, bankData: parsedBank };
  };

  let transactions = [];
  let bankData = null;
  const session = await loadSession();
  bankData = session.bankData;

  const balanceEl = document.getElementById('balance');
  if (balanceEl) {
    balanceEl.textContent = bankData ? formatMoney(bankData.saldo) : 'Sin saldo disponible';
  }

  if (!bankData) {
    transactions = [];
  }

  function render(listEl, items) {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'tx-item empty-state';
      li.innerHTML = '<div class="tx-meta"><div>Sin movimientos aún</div><div class="small">Tu historial aparecerá aquí</div></div>';
      listEl.appendChild(li);
      return;
    }

    items.forEach((tx) => {
      const li = document.createElement('li');
      li.className = 'tx-item';
      li.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon">${String(tx.title || 'M').charAt(0)}</div>
          <div class="tx-meta">
            <div>${tx.title || 'Movimiento'}</div>
            <div class="small">${tx.date || 'Reciente'}</div>
          </div>
        </div>
        <div class="tx-amount">${tx.amount || ''}</div>
      `;
      listEl.appendChild(li);
    });
  }

  render(txList, transactions.slice(0, 3));

  verTodas?.addEventListener('click', () => {
    render(modalList, transactions.length ? transactions : []);
    modal?.classList.remove('hidden');
  });

  closeModal?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  pagarBtn?.addEventListener('click', () => {
    window.location.href = 'pago.html';
  });

  transferirBtn?.addEventListener('click', () => {
    window.location.href = 'transferir.html';
  });

  qrBtn?.addEventListener('click', () => {
    window.location.href = 'qr.html';
  });

  const recargarBtn = document.getElementById('recargarBtn');
  recargarBtn?.addEventListener('click', () => {
    window.location.href = 'recarga.html';
  });

  const serviciosBtn = document.getElementById('serviciosBtn');
  serviciosBtn?.addEventListener('click', () => {
    window.location.href = 'srevicios.html';
  });
});
