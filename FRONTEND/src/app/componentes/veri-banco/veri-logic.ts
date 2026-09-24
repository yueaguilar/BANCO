interface PendingAuth {
  phone?: string;
  email?: string;
  [key: string]: unknown;
}

interface ApiResponse {
  success: boolean;
  message?: string;
}

interface AuthResponse extends ApiResponse {
  user?: Record<string, unknown>;
  bankData?: Record<string, unknown>;
}
import { API_URL } from '../../api-config';

export function iniciarVerificacion(): void {
  const verificationEmailEl = document.getElementById('verification-email');
  const verificationCodeInput = document.getElementById('verification-code') as HTMLInputElement | null;
  const verificationForm = document.getElementById('verification-form');
  const resendBtn = document.getElementById('resend-code');
  const statusEl = document.getElementById('verification-message');

  const pendingAuth: PendingAuth | null = JSON.parse(localStorage.getItem('pendingAuth') || 'null');
  const phone = localStorage.getItem('verificationPhone') || pendingAuth?.phone || '';
  const email = localStorage.getItem('verificationEmail') || pendingAuth?.email || '';

  if (verificationEmailEl) {
    verificationEmailEl.textContent = email || 'correo no disponible';
  }

  const setStatus = (message: string, isError = false): void => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#ffb4b4' : '#d8f3dc';
  };

  const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : '';

  const sendCode = async (): Promise<void> => {
    if (!email) {
      setStatus('No hay un correo electrónico disponible para verificar.', true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/verification/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email })
      });

      const data: ApiResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'No se pudo reenviar el código.');
      }

      setStatus('Se reenvió el código correctamente. Revisa tu correo para ingresarlo manualmente.');
    } catch (error) {
      console.error(error);
      setStatus(getErrorMessage(error) || 'Hubo un problema al reenviar el código.', true);
    }
  };

  if (resendBtn) {
    resendBtn.addEventListener('click', sendCode);
  }

  if (verificationCodeInput) {
    verificationCodeInput.addEventListener('input', () => {
      verificationCodeInput.value = verificationCodeInput.value.replace(/\D/g, '').slice(0, 6);
    });
  }

  if (verificationForm) {
    verificationForm.addEventListener('submit', async (event: Event) => {
      event.preventDefault();
      const code = verificationCodeInput?.value.trim() || '';

      if (!email || !code || code.length !== 6) {
        setStatus('Ingresa un código de 6 dígitos válido.', true);
        return;
      }

      try {
        const response = await fetch('/api/verification/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, phone, code })
        });

        const data: ApiResponse = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'El código es incorrecto.');
        }

        const pending: PendingAuth | null = JSON.parse(localStorage.getItem('pendingAuth') || 'null');
        if (!pending) {
          throw new Error('No hay datos de registro pendientes.');
        }

        const authResponse = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...pending,
            phone,
            email
          })
        });

        const authData: AuthResponse = await authResponse.json();
        if (!authResponse.ok || !authData.success) {
          throw new Error(authData.message || 'No se pudo completar la autenticación.');
        }

        localStorage.setItem('user', JSON.stringify(authData.user));
        if (authData.bankData) localStorage.setItem('bankData', JSON.stringify(authData.bankData));
        localStorage.removeItem('pendingAuth');
        localStorage.removeItem('verificationPhone');
        localStorage.removeItem('verificationEmail');

        setStatus('Verificación exitosa. Redirigiendo...');
        window.location.href = '/app';
      } catch (error) {
        console.error(error);
        setStatus(getErrorMessage(error) || 'Hubo un problema al verificar el código.', true);
      }
    });
  }

  if (email) {
    sendCode();
  } else {
    setStatus('No se encontró un correo para esta sesión.', true);
  }
}