import { Injectable } from '@angular/core';
import { API_URL } from '../api-config';

export interface RegistroContador {
  id: number;
  dispositivo_id: string;
  cantidad_billetes: number;
  fecha_hora: string;
  created_at: string;
  lote_id: string;
}

export interface DepositoContador {
  operacion_id: string;
  numero_cuenta: string;
  contador_id: number;
  denominacion: number;
  cantidad_billetes: number;
  importe: number;
  estado: 'pendiente' | 'confirmado';
  created_at?: string;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

@Injectable({ providedIn: 'root' })
export class ContadorService {
  async obtenerConteosPendientes(token: string): Promise<RegistroContador[]> {
    const data = await this.request<ApiResponse<RegistroContador[]>>(
      '/api/contador/pendientes',
      token
    );
    return data.data ?? [];
  }

  async validarDeposito(
    token: string,
    payload: {
      operacion_id: string;
      numero_cuenta: string;
      contador_id: number;
      denominacion: number;
    }
  ): Promise<DepositoContador> {
    const data = await this.request<ApiResponse<DepositoContador>>(
      '/api/depositos/contador/validar',
      token,
      'POST',
      payload
    );
    if (!data.data) throw new Error('El servidor no devolvió el resumen del depósito.');
    return data.data;
  }

  async confirmarDeposito(token: string, operacionId: string): Promise<DepositoContador & { saldo?: number }> {
    const data = await this.request<ApiResponse<DepositoContador & { saldo?: number }>>(
      '/api/depositos/contador/confirmar',
      token,
      'POST',
      { operacion_id: operacionId }
    );
    if (!data.data) throw new Error('El servidor no devolvió el resultado del depósito.');
    return data.data;
  }

  async cancelarValidacion(token: string, operacionId: string): Promise<void> {
    await this.request<ApiResponse<unknown>>(
      '/api/depositos/contador/cancelar',
      token,
      'POST',
      { operacion_id: operacionId }
    );
  }

  async comprobarBackend(): Promise<boolean> {
    const response = await fetch(`${API_URL}/api`);
    return response.ok;
  }

  private async request<T>(
    path: string,
    token: string,
    method = 'GET',
    body?: object
  ): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const data = await response.json() as T & ApiResponse<unknown>;
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'No se pudo completar la operación.');
    }
    return data;
  }
}
