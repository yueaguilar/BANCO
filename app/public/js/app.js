// Interacciones simples: renderizar transacciones, abrir/cerrar modal
document.addEventListener('DOMContentLoaded',()=>{
  const txList = document.getElementById('txList');
  const modal = document.getElementById('modal');
  const modalList = document.getElementById('modalList');
  const verTodas = document.getElementById('verTodas');
  const closeModal = document.getElementById('closeModal');

  const transactions = [
    {id:1,title:'Pago supermercado',date:'Hoy',amount:'- $ 45,20'},
    {id:2,title:'Transferencia recibida',date:'Ayer',amount:'+ $ 1.200,00'},
    {id:3,title:'Carga de saldo',date:'Hace 2 días',amount:'+ $ 200,00'},
  ];

  function render(listEl, items){
    listEl.innerHTML = '';
    items.forEach(tx=>{
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

  // render inicial (3 ultimas)
  render(txList,transactions.slice(0,3));

  verTodas.addEventListener('click',()=>{
    render(modalList,transactions);
    modal.classList.remove('hidden');
  });

  closeModal.addEventListener('click',()=>{
    modal.classList.add('hidden');
  });

  // botones rápidos (ejemplo)
  document.getElementById('pagarBtn').addEventListener('click',()=>alert('Ir a pantalla Pagar'));
  document.getElementById('transferirBtn').addEventListener('click',()=>alert('Ir a Transferir'));
  document.getElementById('qrBtn').addEventListener('click',()=>alert('Abrir escáner QR'));
});
