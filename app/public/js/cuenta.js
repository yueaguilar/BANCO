document.addEventListener('DOMContentLoaded', async () => {
  const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS'
  }).format(Number(value || 0));

  const readLocalSession = () => {
    try {
      return {
        user: JSON.parse(localStorage.getItem('user')),
        bankData: JSON.parse(localStorage.getItem('bankData'))
      };
    } catch (error) {
      return { user: null, bankData: null };
    }
  };

  // Pide la sesión al servidor con tiempo límite para que la página nunca se quede en "Cargando..."
  const fetchSession = async (email) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/api/session?email=${encodeURIComponent(email)}`, { signal: controller.signal });
      const data = await response.json();
      if (response.ok && data.success) {
        return data;
      }
    } catch (error) {
      console.warn('No se pudo obtener la sesión activa', error);
    } finally {
      clearTimeout(timer);
    }
    return null;
  };

  const render = (user, bankData) => {
    const profileNameEl = document.querySelector('.profile-meta h2');
    if (profileNameEl) {
      profileNameEl.textContent = user?.fullname || 'Usuario';
    }

    const balanceEl = document.querySelector('.main-card .balance');
    if (balanceEl) {
      balanceEl.textContent = bankData ? formatMoney(bankData.saldo) : 'Sin saldo disponible';
    }

    const accountStrong = document.getElementById('accountNumberDisplay');
    if (accountStrong && bankData?.numeroCuenta) {
      const num = String(bankData.numeroCuenta);
      accountStrong.textContent = num;
    }

    // El NIP solo se muestra si el servidor lo entregó (justo al crear la cuenta); en la BD solo existe el hash.
    const nipStrong = document.getElementById('nipDisplay');
    if (nipStrong) {
      nipStrong.textContent = bankData?.nip ? String(bankData.nip) : '****';
    }

    // Panel "Ver detalle"
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText('detailHolder', user?.fullname || 'Usuario');
    setText('detailAccount', bankData?.numeroCuenta ? String(bankData.numeroCuenta) : 'No disponible');
    setText('detailNip', bankData?.nip ? String(bankData.nip) : '****');
    setText('detailExpiry', bankData?.mesExpiracion && bankData?.anioExpiracion
      ? `${String(bankData.mesExpiracion).padStart(2, '0')}/${String(bankData.anioExpiracion).slice(-2)}`
      : '--/--');

    const cardStrong = document.querySelector('.credit-card strong');
    const cardBottomSpans = document.querySelectorAll('.credit-card .card-bottom span');
    if (cardStrong && bankData?.numeroTarjeta) {
      const num = String(bankData.numeroTarjeta);
      cardStrong.textContent = '•••• ' + num.slice(-4);
      if (cardBottomSpans.length >= 2) {
        cardBottomSpans[0].textContent = user?.fullname || 'Titular';
        cardBottomSpans[1].textContent = `${String(bankData.mesExpiracion || '').padStart(2, '0')}/${String(bankData.anioExpiracion || '').slice(-2)}`;
      }
    }

    const main = document.querySelector('main');
    const oldNotice = document.querySelector('main .notice');
    if (oldNotice) oldNotice.remove();
    if (!bankData) {
      const warning = document.createElement('div');
      warning.className = 'notice';
      warning.textContent = 'No hay datos de cuenta para esta sesión. Inicia sesión para ver información real.';
      if (main) main.prepend(warning);
    }
  };

  // Modal "Ver todo": muestra el historial completo (copia lo que hay en la lista de actividades)
  const modal = document.getElementById('modal');
  const modalList = document.getElementById('modalList');
  const sourceList = document.getElementById('transactionList');
  const openModalBtn = document.getElementById('verTodas');
  const closeModalBtn = document.getElementById('closeModal');
  const recargarBtn = document.getElementById('recargarBtn');

  if (recargarBtn) {
    recargarBtn.addEventListener('click', () => {
      window.location.href = 'recarga.html';
    });
  }

  if (modal && modalList && openModalBtn) {
    const openModal = () => {
      if (sourceList) modalList.innerHTML = sourceList.innerHTML;
      modal.classList.remove('hidden');
    };
    const closeModal = () => modal.classList.add('hidden');

    openModalBtn.addEventListener('click', openModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });
  }

  // Panel "Ver detalle": titular, número de cuenta, NIP y vigencia
  const detailModal = document.getElementById('detailModal');
  const openDetailBtn = document.getElementById('verDetalle');
  const closeDetailBtn = document.getElementById('closeDetail');

  if (detailModal && openDetailBtn) {
    const openDetail = () => detailModal.classList.remove('hidden');
    const closeDetail = () => detailModal.classList.add('hidden');

    openDetailBtn.addEventListener('click', openDetail);
    if (closeDetailBtn) closeDetailBtn.addEventListener('click', closeDetail);
    detailModal.addEventListener('click', (event) => {
      if (event.target === detailModal) closeDetail();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDetail();
    });
  }

  const local = readLocalSession();
  const needsFetch = Boolean(local.user?.email) && !local.bankData;

  if (!needsFetch) {
    render(local.user, local.bankData);
    return;
  }

  const data = await fetchSession(local.user.email);
  if (data) {
    try {
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('bankData', JSON.stringify(data.bankData));
    } catch (error) {
      console.warn('No se pudo guardar la sesión localmente', error);
    }
    render(data.user, data.bankData);
  } else {
    render(local.user, local.bankData);
  }
});