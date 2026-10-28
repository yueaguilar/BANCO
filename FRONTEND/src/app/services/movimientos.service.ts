import { API_URL } from '../api-config';

export interface MovimientoBancario {
  id: number;
  tipo: string;
  monto: number | string;
  descripcion: string;
  created_at: string;
}

interface RespuestaMovimientos {
  success: boolean;
  message?: string;
  data?: MovimientoBancario[];
}

export async function obtenerMovimientosBancarios(
  token: string
): Promise<MovimientoBancario[]> {
  if (!token) {
    throw new Error('Inicia sesión para consultar tus movimientos.');
  }

  const response = await fetch(`${API_URL}/api/movimientos`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json() as RespuestaMovimientos;

  if (!response.ok || !result.success || !Array.isArray(result.data)) {
    throw new Error(result.message || 'No se pudo actualizar el historial de movimientos.');
  }

  return result.data;
}

export function esIngreso(movimiento: MovimientoBancario): boolean {
  return movimiento.tipo.toLowerCase().startsWith('deposito');
}

export function etiquetaMovimiento(tipo: string): string {
  const normalizado = tipo.toLowerCase();

  if (normalizado.startsWith('deposito')) return 'Depósito en efectivo';
  if (normalizado.includes('transfer')) return 'Transferencia';
  if (normalizado.includes('recarga')) return 'Recarga';
  if (normalizado.includes('servicio') || normalizado.includes('pago')) return 'Pago de servicio';

  return tipo
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('es-MX'));
}

export function formatearFechaMovimiento(fecha: string): string {
  const date = new Date(fecha);
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function renderizarMovimiento(
  movimiento: MovimientoBancario,
  variante: 'home' | 'cuenta' | 'movimientos'
): HTMLLIElement {
  const ingreso = esIngreso(movimiento);
  const item = document.createElement('li');
  const iconClass = ingreso ? 'income' : 'transfer';
  const iconText = ingreso ? '+' : '−';
  const monto = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(Number(movimiento.monto || 0));
  const signedAmount = `${ingreso ? '+' : '−'}${monto}`;

  if (variante === 'movimientos') {
    item.className = 'movement-item';
    const left = document.createElement('div');
    left.className = 'movement-left';
    const icon = document.createElement('span');
    icon.className = `movement-icon ${iconClass}`;
    icon.textContent = iconText;
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = movimiento.descripcion || etiquetaMovimiento(movimiento.tipo);
    const label = document.createElement('small');
    label.className = `movement-kind ${iconClass}`;
    label.textContent = etiquetaMovimiento(movimiento.tipo);
    details.append(title, label);
    left.append(icon, details);

    const right = document.createElement('div');
    right.className = 'movement-right';
    const amount = document.createElement('span');
    amount.className = `amount ${ingreso ? 'positive' : 'negative'}`;
    amount.textContent = signedAmount;
    const date = document.createElement('small');
    date.textContent = formatearFechaMovimiento(movimiento.created_at);
    right.append(amount, date);
    item.append(left, right);
    return item;
  }

  item.className = variante === 'home' ? 'tx-item' : 'transaction-item';
  const left = document.createElement('div');
  left.className = variante === 'home' ? 'tx-left' : 'transaction-left';
  const icon = document.createElement('span');
  icon.className = variante === 'home'
    ? `tx-icon ${iconClass}`
    : `transaction-icon ${iconClass}`;
  icon.textContent = iconText;
  const details = document.createElement('div');
  details.className = variante === 'home' ? 'tx-meta' : '';
  const title = document.createElement('strong');
  title.textContent = movimiento.descripcion || etiquetaMovimiento(movimiento.tipo);
  const label = document.createElement('small');
  label.className = `movement-kind ${iconClass}`;
  label.textContent = etiquetaMovimiento(movimiento.tipo);
  const date = document.createElement('small');
  date.className = variante === 'home' ? 'small' : '';
  date.textContent = formatearFechaMovimiento(movimiento.created_at);
  details.append(title, label, date);
  left.append(icon, details);

  const amount = document.createElement('span');
  amount.className = `amount ${ingreso ? 'positive' : 'negative'}`;
  amount.textContent = signedAmount;
  if (variante === 'home') {
    const amountContainer = document.createElement('div');
    amountContainer.className = 'tx-amount';
    amountContainer.append(amount);
    item.append(left, amountContainer);
  } else {
    const right = document.createElement('div');
    right.className = 'transaction-right';
    right.append(amount);
    item.append(left, right);
  }
  return item;
}

export function renderizarEstadoVacio(
  variante: 'home' | 'cuenta' | 'movimientos',
  mensaje: string
): HTMLLIElement {
  const item = document.createElement('li');
  item.className = variante === 'home'
    ? 'tx-item empty-state'
    : variante === 'cuenta'
      ? 'transaction-item empty-state'
      : 'movement-item empty-state';
  item.textContent = mensaje;
  return item;
}
