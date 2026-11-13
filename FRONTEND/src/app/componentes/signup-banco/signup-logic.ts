export function formatearTelefono(telefono: string): string {
  const prefijo = telefono.startsWith('+') ? '+' : '';
  return `${prefijo}${telefono.replace(/\D/g, '').slice(0, 12)}`;
}

export function normalizarTelefono(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, '');
  if (/^\d{10}$/.test(digitos)) return digitos;
  if (/^52\d{10}$/.test(digitos)) return digitos.slice(2);
  return null;
}

export function validarDatosRegistro(email: string, password: string, telefono: string): string | null {
  if (!email.trim() || !password) {
    return 'El correo y la contraseña son obligatorios para crear la cuenta.';
  }
  if (!normalizarTelefono(telefono)) {
    return 'El número debe incluir +52 y exactamente 10 dígitos de celular.';
  }
  return null;
}
