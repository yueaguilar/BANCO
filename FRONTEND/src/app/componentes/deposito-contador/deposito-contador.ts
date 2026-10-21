import { Component } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ApiRequestError,
  ContadorService,
  MovimientoBancario,
  DepositoContador as ResumenDeposito,
  RegistroContador
} from '../../services/contador.service';

interface OperacionGuardada {
  operacionId: string;
  numeroCuenta: string;
  contadorId: number;
  denominacion: number;
  resumen: ResumenDeposito | null;
}

const CLAVE_OPERACION_PENDIENTE = 'pendingCounterDeposit';

@Component({
  selector: 'app-deposito-contador',
  standalone: true,
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe],
  templateUrl: './deposito-contador.html',
  styleUrls: ['./deposito-contador.css']
})
export class DepositoContador {
  token = '';
  numeroCuenta = '';
  denominacion = 100;
  contadorId: number | null = null;
  conteos: RegistroContador[] = [];
  resumen: ResumenDeposito | null = null;
  operacionId = '';
  validando = false;
  confirmando = false;
  cargandoConteos = false;
  mensaje = '';
  error = false;
  backendComprobado = false;
  backendDisponible = false;
  saldoActualizado: number | null = null;
  importeConfirmado: number | null = null;

  private solicitudPendiente: OperacionGuardada | null = null;

  constructor(private readonly contadorService: ContadorService) {
    if (typeof localStorage !== 'undefined') {
      this.token = localStorage.getItem('sessionToken') || '';
      try {
        const bankData = JSON.parse(localStorage.getItem('bankData') || 'null') as { numeroCuenta?: string } | null;
        this.numeroCuenta = String(bankData?.numeroCuenta || '');
      } catch {
        this.numeroCuenta = '';
      }
      try {
        const pending = JSON.parse(localStorage.getItem(CLAVE_OPERACION_PENDIENTE) || 'null') as OperacionGuardada | null;
        if (pending && typeof pending.operacionId === 'string' && Number.isSafeInteger(pending.contadorId)) {
          this.solicitudPendiente = pending;
          this.operacionId = pending.operacionId;
          this.numeroCuenta = pending.numeroCuenta;
          this.contadorId = pending.contadorId;
          this.denominacion = pending.denominacion;
          this.resumen = pending.resumen;
        }
      } catch (error) {
        console.error('No se pudo recuperar la operación pendiente del depósito.', error);
        this.error = true;
        this.mensaje = 'No se pudo recuperar el estado de una operación guardada en este dispositivo.';
      }
    }
    void this.comprobarConexion();
    if (this.token) void this.cargarConteos();
    if (this.token && this.operacionId && !this.resumen) {
      void this.validarDeposito();
    }
  }

  get conteoSeleccionado(): RegistroContador | undefined {
    return this.conteos.find((conteo) => conteo.id === this.contadorId);
  }

  get formularioValido(): boolean {
    const hasValidCount = Number.isSafeInteger(this.contadorId) && Number(this.contadorId) > 0;
    return Boolean(this.token)
      && /^\d{10}$/.test(this.numeroCuenta.trim())
      && hasValidCount
      && (this.denominacion === 20 || this.denominacion === 50 || this.denominacion === 100 || this.denominacion === 200 || this.denominacion === 500)
      && (Boolean(this.solicitudPendiente) || Boolean(this.conteoSeleccionado));
  }

  async cargarConteos(): Promise<void> {
    if (!this.token || this.cargandoConteos) return;
    this.cargandoConteos = true;
    try {
      this.conteos = await this.contadorService.obtenerConteosPendientes(this.token);
    } catch (error) {
      this.error = true;
      this.mensaje = error instanceof Error ? error.message : 'No se pudieron cargar los conteos.';
    } finally {
      this.cargandoConteos = false;
    }
  }

  async validarDeposito(): Promise<void> {
    if (!this.formularioValido || this.validando) return;
    this.validando = true;
    this.mensaje = '';
    this.error = false;
    try {
      if (!this.operacionId) {
        this.operacionId = crypto.randomUUID();
        this.solicitudPendiente = {
          operacionId: this.operacionId,
          numeroCuenta: this.numeroCuenta.trim(),
          contadorId: Number(this.contadorId),
          denominacion: this.denominacion,
          resumen: null
        };
      }
      if (!this.solicitudPendiente) {
        throw new Error('No se pudo recuperar la solicitud pendiente. No se envió el depósito.');
      }
      localStorage.setItem(CLAVE_OPERACION_PENDIENTE, JSON.stringify(this.solicitudPendiente));
      this.resumen = await this.contadorService.validarDeposito(this.token, {
        operacion_id: this.solicitudPendiente.operacionId,
        numero_cuenta: this.solicitudPendiente.numeroCuenta,
        contador_id: this.solicitudPendiente.contadorId,
        denominacion: this.solicitudPendiente.denominacion
      });
      this.solicitudPendiente.resumen = this.resumen;
      localStorage.setItem(CLAVE_OPERACION_PENDIENTE, JSON.stringify(this.solicitudPendiente));
    } catch (error) {
      if (await this.recuperarEstadoOperacion()) return;
      this.error = true;
      this.mensaje = error instanceof Error ? error.message : 'No se pudo validar el depósito.';
    } finally {
      this.validando = false;
    }
  }

  async confirmarDeposito(): Promise<void> {
    if (!this.resumen || !this.operacionId || this.confirmando) return;
    this.confirmando = true;
    this.mensaje = '';
    this.error = false;
    try {
      const resultado = await this.contadorService.confirmarDeposito(this.token, this.operacionId);
      let saldoActualizado = true;
      if (typeof resultado.saldo === 'number') {
        this.saldoActualizado = resultado.saldo;
        saldoActualizado = this.actualizarSaldoLocal(resultado.saldo);
      }
      this.importeConfirmado = resultado.importe;
      localStorage.removeItem(CLAVE_OPERACION_PENDIENTE);
      this.resumen = null;
      this.operacionId = '';
      this.solicitudPendiente = null;
      this.contadorId = null;
      this.mensaje = `Depósito confirmado. Importe: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(resultado.importe)}.`;
      if (!saldoActualizado) {
        this.mensaje += ' No se pudo actualizar el saldo local; recarga la cuenta para sincronizarla.';
      }
      const movimientosActualizados = await this.actualizarMovimientos();
      if (!movimientosActualizados) {
        this.mensaje += ' El historial se actualizará cuando vuelva la conexión.';
      }
      await this.cargarConteos();
    } catch (error) {
      this.error = true;
      this.mensaje = error instanceof Error ? error.message : 'No se pudo confirmar el depósito.';
    } finally {
      this.confirmando = false;
    }
  }

  async cancelarValidacion(): Promise<void> {
    if (!this.operacionId) return;
    this.confirmando = true;
    this.error = false;
    try {
      await this.contadorService.cancelarValidacion(this.token, this.operacionId);
      this.resumen = null;
      this.operacionId = '';
      this.solicitudPendiente = null;
      localStorage.removeItem(CLAVE_OPERACION_PENDIENTE);
      this.mensaje = '';
      await this.cargarConteos();
    } catch (error) {
      this.error = true;
      this.mensaje = error instanceof Error ? error.message : 'No se pudo cancelar la validación.';
    } finally {
      this.confirmando = false;
    }
  }

  private async comprobarConexion(): Promise<void> {
    try {
      this.backendDisponible = await this.contadorService.comprobarBackend();
    } catch {
      this.backendDisponible = false;
    } finally {
      this.backendComprobado = true;
    }
  }

  private actualizarSaldoLocal(saldo: number): boolean {
    try {
      const bankData = JSON.parse(localStorage.getItem('bankData') || '{}') as Record<string, unknown>;
      localStorage.setItem('bankData', JSON.stringify({ ...bankData, saldo }));
      return true;
    } catch (error) {
      console.error('No se pudo actualizar el saldo almacenado localmente.', error);
      return false;
    }
  }

  private async actualizarMovimientos(): Promise<boolean> {
    try {
      const movimientos: MovimientoBancario[] = await this.contadorService.obtenerMovimientos(this.token);
      localStorage.setItem('bankMovements', JSON.stringify(movimientos));
      return true;
    } catch (error) {
      console.error('No se pudo actualizar el historial local de movimientos.', error);
      return false;
    }
  }

  private async recuperarEstadoOperacion(): Promise<boolean> {
    if (!this.operacionId) return false;
    try {
      const operation = await this.contadorService.obtenerDeposito(this.token, this.operacionId);
      if (operation.estado === 'pendiente') {
        this.resumen = operation;
        if (this.solicitudPendiente) {
          this.solicitudPendiente.resumen = operation;
          localStorage.setItem(CLAVE_OPERACION_PENDIENTE, JSON.stringify(this.solicitudPendiente));
        }
        this.error = false;
        this.mensaje = 'La validación ya se había guardado. Revisa el resumen y confirma cuando estés listo.';
        return true;
      }
      if (operation.estado === 'confirmado') {
        const balance = Number(operation.saldo_resultante);
        let saldoSincronizado = true;
        if (Number.isFinite(balance)) {
          this.saldoActualizado = balance;
          saldoSincronizado = this.actualizarSaldoLocal(balance);
        }
        this.importeConfirmado = Number(operation.importe);
        const movimientosSincronizados = await this.actualizarMovimientos();
        this.error = false;
        this.mensaje = 'Este depósito ya había sido confirmado; no se volvió a acreditar.';
        if (!saldoSincronizado) this.mensaje += ' Recarga la cuenta para sincronizar el saldo.';
        if (!movimientosSincronizados) this.mensaje += ' El historial se actualizará cuando vuelva la conexión.';
      } else {
        this.error = true;
        this.mensaje = 'La operación ya estaba cancelada. Selecciona un conteo nuevo para continuar.';
      }
      localStorage.removeItem(CLAVE_OPERACION_PENDIENTE);
      this.resumen = null;
      this.operacionId = '';
      this.solicitudPendiente = null;
      this.contadorId = null;
      return true;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        localStorage.removeItem(CLAVE_OPERACION_PENDIENTE);
        this.operacionId = '';
        this.solicitudPendiente = null;
      }
      return false;
    }
  }
}
