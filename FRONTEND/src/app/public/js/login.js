document.addEventListener('DOMContentLoaded', () => {
	const form = document.getElementById('auth-form');
	if (!form) return;

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		const email = document.getElementById('email').value.trim();
		const fullname = document.getElementById('fullname').value.trim();
		const birthdate = document.getElementById('birthdate').value;
		const phone = document.getElementById('phone').value.replace(/\D/g, '');
		const password = document.getElementById('password').value;

		if (!email || !password) {
			alert('Correo y contraseña son obligatorios.');
			return;
		}

		if (phone.length < 10) {
			alert('Debes ingresar un número de celular válido para recibir el código de verificación.');
			return;
		}

		try {
			const res = await fetch('/api/verification/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone, email })
			});
			const data = await res.json();

			if (!res.ok || !data.success) {
				alert(data.message || 'No se pudo enviar el código de verificación.');
				return;
			}

			localStorage.setItem('pendingAuth', JSON.stringify({ email, fullname, birthdate, password, phone }));
			localStorage.setItem('verificationPhone', phone);
			localStorage.setItem('verificationEmail', email);
			window.location.href = '/veri.html';
		} catch (err) {
			console.error(err);
			alert('Error en la comunicación con el servidor');
		}
	});

	const pwdInput = document.getElementById('password');
	const toggle = document.getElementById('toggle-password');
	if (toggle && pwdInput) {
		toggle.addEventListener('change', () => {
			pwdInput.type = toggle.checked ? 'text' : 'password';
		});
	}

	const phoneInput = document.getElementById('phone');
	if (phoneInput) {
		phoneInput.addEventListener('input', () => {
			phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
		});
	}
});
