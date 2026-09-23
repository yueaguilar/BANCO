interface PendingAuth {
  email: string;
  fullname: string;
  birthdate: string;
  password: string;
  phone: string;
}

interface VerificationResponse {
  success: boolean;
  message?: string;
}

export function iniciarLogin(): void {

  const form =
    document.getElementById('auth-form') as HTMLFormElement | null;

  if (!form) {
    return;
  }

  form.addEventListener(
    'submit',
    async (e: SubmitEvent) => {

      e.preventDefault();

      const emailInput =
        document.getElementById('email') as HTMLInputElement | null;

      const fullnameInput =
        document.getElementById('fullname') as HTMLInputElement | null;

      const birthdateInput =
        document.getElementById('birthdate') as HTMLInputElement | null;

      const phoneInput =
        document.getElementById('phone') as HTMLInputElement | null;

      const passwordInput =
        document.getElementById('password') as HTMLInputElement | null;

      if (
        !emailInput ||
        !fullnameInput ||
        !birthdateInput ||
        !phoneInput ||
        !passwordInput
      ) {
        console.error(
          'No se encontraron todos los campos del formulario.'
        );

        return;
      }

      const email =
        emailInput.value.trim();

      const fullname =
        fullnameInput.value.trim();

      const birthdate =
        birthdateInput.value;

      const phone =
        phoneInput.value
          .replace(/\D/g, '');

      const password =
        passwordInput.value;

      if (!email || !password) {

        alert(
          'Correo y contraseña son obligatorios.'
        );

        return;
      }

      if (phone.length < 10) {

        alert(
          'Debes ingresar un número de celular válido para recibir el código de verificación.'
        );

        return;
      }

      try {

        const res =
          await fetch('/api/verification/send', {
            method: 'POST',

            headers: {
              'Content-Type': 'application/json'
            },

            body: JSON.stringify({
              phone,
              email
            })
          });

        const data =
          await res.json() as VerificationResponse;

        if (
          !res.ok ||
          !data.success
        ) {

          alert(
            data.message ||
            'No se pudo enviar el código de verificación.'
          );

          return;
        }

        const pendingAuth: PendingAuth = {
          email,
          fullname,
          birthdate,
          password,
          phone
        };

        localStorage.setItem(
          'pendingAuth',
          JSON.stringify(pendingAuth)
        );

        localStorage.setItem(
          'verificationPhone',
          phone
        );

        localStorage.setItem(
          'verificationEmail',
          email
        );

        window.location.href =
          '/veri.html';

      } catch (err) {

        console.error(
          'Error enviando código de verificación:',
          err
        );

        alert(
          'Error en la comunicación con el servidor'
        );
      }
    }
  );

  // ==========================================
  // MOSTRAR / OCULTAR CONTRASEÑA
  // ==========================================

  const pwdInput =
    document.getElementById(
      'password'
    ) as HTMLInputElement | null;

  const toggle =
    document.getElementById(
      'toggle-password'
    ) as HTMLInputElement | null;

  if (
    toggle &&
    pwdInput
  ) {

    toggle.addEventListener(
      'change',
      () => {

        pwdInput.type =
          toggle.checked
            ? 'text'
            : 'password';
      }
    );
  }

  // ==========================================
  // FORMATO DEL TELÉFONO
  // ==========================================

  const phoneInput =
    document.getElementById(
      'phone'
    ) as HTMLInputElement | null;

  if (phoneInput) {

    phoneInput.addEventListener(
      'input',
      () => {

        phoneInput.value =
          phoneInput.value
            .replace(/\D/g, '')
            .slice(0, 10);
      }
    );
  }
}