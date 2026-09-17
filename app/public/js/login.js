document.addEventListener('DOMContentLoaded', () => {
	const form = document.getElementById('auth-form');
	if (!form) return;

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		const email = document.getElementById('email').value;
		const fullname = document.getElementById('fullname').value;
		const birthdate = document.getElementById('birthdate').value;
		const password = document.getElementById('password').value;

		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, fullname, birthdate, password })
			});
			const data = await res.json();
			if (res.ok && data.success) {
				// Store returned user and bankData for frontend pages
				try {
					if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
					if (data.bankData) localStorage.setItem('bankData', JSON.stringify(data.bankData));
				} catch (e) {
					console.warn('Could not store session data locally', e);
				}
				// Redirect to app page
				window.location.href = '/app';
			} else {
				alert(data.message || 'Error en autenticación');
			}
		} catch (err) {
			console.error(err);
			alert('Error en la comunicación con el servidor');
		}
	});

	// Toggle password visibility
	const pwdInput = document.getElementById('password');
	const toggle = document.getElementById('toggle-password');
	if (toggle && pwdInput) {
		toggle.addEventListener('change', () => {
			pwdInput.type = toggle.checked ? 'text' : 'password';
		});
	}
});
