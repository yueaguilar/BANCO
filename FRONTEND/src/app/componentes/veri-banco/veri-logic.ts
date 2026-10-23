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
  token?: string;
  user?: Record<string, unknown>;
  bankData?: Record<string, unknown>;
}
import { API_URL } from '../../api-config';

export function iniciarVerificacion(): void {
  const verificationPhoneEl = document.getElementById('verification-phone');
  const verificationCodeInput = document.getElementById('verification-code') as HTMLInputElement | null;
  const verificationForm = document.getElementById('verification-form');
  const resendBtn = document.getElementById('resend-code');
  const statusEl = document.getElementById('verification-message');

  const pendingAuth: PendingAuth | null = JSON.parse(localStorage.getItem('pendingAuth') || 'null');
  const phone = localStorage.getItem('verificationPhone') || pendingAuth?.phone || '';

  if (verificationPhoneEl) {
    verificationPhoneEl.textContent = phone || 'teléfono no disponible';
  }

  const setStatus = (message: string, isError = false): void => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#ffb4b4' : '#d8f3dc';
  };

  const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : '';

  const sendCode = async (): Promise<void> => {
    if (!phone) {
      setStatus('No hay un número de teléfono disponible para verificar.', true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/verification/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      const data: ApiResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'No se pudo reenviar el código.');
      }

      setStatus('Se envió un nuevo código SMS al teléfono indicado.');
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

      if (!phone || !code || code.length !== 6) {
        setStatus('Ingresa un código de 6 dígitos válido.', true);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/verification/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code })
        });

        const data: ApiResponse = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'El código es incorrecto.');
        }

        const pending: PendingAuth | null = JSON.parse(localStorage.getItem('pendingAuth') || 'null');
        if (!pending) {
          throw new Error('No hay datos de registro pendientes.');
        }

        const authResponse = await fetch(`${API_URL}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...pending,
            phone,
            email: pending.email
          })
        });

        const authData: AuthResponse = await authResponse.json();
        if (!authResponse.ok || !authData.success) {
          throw new Error(authData.message || 'No se pudo completar la autenticación.');
        }

        if (!authData.token) {
          throw new Error('El servidor no devolvió una sesión segura.');
        }
        localStorage.setItem('sessionToken', authData.token);
        localStorage.setItem('user', JSON.stringify(authData.user));
        if (authData.bankData) localStorage.setItem('bankData', JSON.stringify(authData.bankData));
        localStorage.removeItem('pendingAuth');
        localStorage.removeItem('verificationPhone');

        setStatus('Verificación exitosa. Redirigiendo...');
        window.location.href = '/app';
      } catch (error) {
        console.error(error);
        setStatus(getErrorMessage(error) || 'Hubo un problema al verificar el código.', true);
      }
    });
  }

  if (phone) {
    sendCode();
  } else {
    setStatus('No se encontró un teléfono para esta sesión.', true);
  }
}