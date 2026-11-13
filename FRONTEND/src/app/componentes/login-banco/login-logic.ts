export function validarCredencialesCuenta(accountNumber: string, password: string): string | null {
  if (!/^\d{10}$/.test(accountNumber.trim()) || !password) {
    return 'Ingresa un número de cuenta de 10 dígitos y tu contraseña.';
  }

  return null;
}
