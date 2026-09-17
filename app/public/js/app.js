// Interacciones principales: renderizado, modal y flujo de pago
document.addEventListener('DOMContentLoaded', () => {
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

  const transactions = [
    { id: 1, title: 'Pago supermercado', date: 'Hoy', amount: '- $ 45,20' },
    { id: 2, title: 'Transferencia recibida', date: 'Ayer', amount: '+ $ 1.200,00' },
    { id: 3, title: 'Carga de saldo', date: 'Hace 2 días', amount: '+ $ 200,00' },
  ];

  function render(listEl, items) {
    listEl.innerHTML = '';
    items.forEach((tx) => {
      const li = document.createElement('li');
      li.className = 'tx-item';
      li.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon">${tx.title.charAt(0)}</div>
          <div class="tx-meta">
            <div>${tx.title}</div>
            <div class="small">${tx.date}</div>
          </div>
        </div>
        <div class="tx-amount">${tx.amount}</div>
      `;
      listEl.appendChild(li);
    });
  }

  render(txList, transactions.slice(0, 3));

  verTodas.addEventListener('click', () => {
    render(modalList, transactions);
    modal.classList.remove('hidden');
  });

  closeModal.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  pagarBtn.addEventListener('click', () => {
    window.location.href = 'pago.html';
  });

  transferirBtn.addEventListener('click', () => {
    window.location.href = 'transferir.html';
  });

  qrBtn.addEventListener('click', () => {
    alert('Abrir escáner QR');
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
