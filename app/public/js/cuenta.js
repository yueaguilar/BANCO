document.addEventListener('DOMContentLoaded', async () => {
  const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS'
  }).format(Number(value || 0));

  const getSession = async () => {
    let user = null;
    let bankData = null;

    try {
      user = JSON.parse(localStorage.getItem('user'));
      bankData = JSON.parse(localStorage.getItem('bankData'));
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
        const data = await response.json();
        if (response.ok && data.success) {
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('bankData', JSON.stringify(data.bankData));
          return { user: data.user, bankData: data.bankData };
        }
      } catch (error) {
        console.warn('No se pudo obtener la sesión activa', error);
      }
    }

    return { user, bankData };
  };

  const session = await getSession();
  const user = session.user;
  const bankData = session.bankData;

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

  const nipStrong = document.getElementById('nipDisplay');
  if (nipStrong) {
    nipStrong.textContent = bankData?.nip ? String(bankData.nip) : '****';
  }

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

  if (!bankData) {
    const main = document.querySelector('main');
    const warning = document.createElement('div');
    warning.className = 'notice';
    warning.textContent = 'No hay datos de cuenta para esta sesión. Inicia sesión para ver información real.';
    if (main) main.prepend(warning);
  }
});
