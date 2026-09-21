document.addEventListener('DOMContentLoaded', () => {
    const verificationPhoneEl = document.getElementById('verification-phone');
    const verificationCodeInput = document.getElementById('verification-code');
    const verificationForm = document.getElementById('verification-form');
    const resendBtn = document.getElementById('resend-code');
    const statusEl = document.getElementById('verification-message');

    const pendingAuth = JSON.parse(localStorage.getItem('pendingAuth') || 'null');
    const phone = localStorage.getItem('verificationPhone') || pendingAuth?.phone || '';

    if (verificationPhoneEl) {
        verificationPhoneEl.textContent = phone ? `+52 ${phone}` : 'número no disponible';
    }

    const setStatus = (message, isError = false) => {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.style.color = isError ? '#ffb4b4' : '#d8f3dc';
    };

    const sendCode = async () => {
        if (!phone) {
            setStatus('No hay un número disponible para verificar.', true);
            return;
        }

        try {
            const response = await fetch('/api/verification/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, email: pendingAuth?.email || localStorage.getItem('verificationEmail') || '' })
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'No se pudo reenviar el código.');
            }

            setStatus('Se reenvió el código correctamente.');
        } catch (error) {
            console.error(error);
            setStatus(error.message || 'Hubo un problema al reenviar el código.', true);
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
        verificationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const code = verificationCodeInput?.value.trim() || '';

            if (!phone || !code || code.length !== 6) {
                setStatus('Ingresa un código de 6 dígitos válido.', true);
                return;
            }

            try {
                const response = await fetch('/api/verification/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, code })
                });

                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'El código es incorrecto.');
                }

                const pending = JSON.parse(localStorage.getItem('pendingAuth') || 'null');
                if (!pending) {
                    throw new Error('No hay datos de registro pendientes.');
                }

                const authResponse = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...pending,
                        phone,
                        verificationCode: code
                    })
                });

                const authData = await authResponse.json();
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
                setStatus(error.message || 'Hubo un problema al verificar el código.', true);
            }
        });
    }

    if (phone) {
        sendCode();
    } else {
        setStatus('No se encontró el teléfono para esta sesión.', true);
    }
});
