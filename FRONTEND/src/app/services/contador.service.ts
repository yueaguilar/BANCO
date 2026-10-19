import { Injectable } from '@angular/core';
import { API_URL } from '../api-config';

export interface RegistroContador {
  id: number;
  dispositivo_id: string;
  cantidad_billetes: number;
  fecha_hora: string;
  created_at: string;
}

export interface RespuestaContador {
  success: boolean;
  message: string;
  data?: RegistroContador;
}

@Injectable({ providedIn: 'root' })
export class ContadorService {
  async registrarConteo(dispositivoId: string, cantidadBilletes: number): Promise<RespuestaContador> {
    const response = await fetch(`${API_URL}/api/contador`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispositivo_id: dispositivoId,
        cantidad_billetes: cantidadBilletes
      })
    });

    const data = await response.json() as RespuestaContador;
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'No se pudo registrar el conteo.');
    }
    return data;
  }

  async comprobarBackend(): Promise<boolean> {
    const response = await fetch(`${API_URL}/api`);
    return response.ok;
  }
}
