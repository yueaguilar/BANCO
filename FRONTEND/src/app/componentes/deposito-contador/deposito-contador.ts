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
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/app" aria-label="Volver al inicio"><img src="/img/logo2.png" alt="Logo de Banco LCDK" class="logo"></a>
        <h1 class="brand">Banco KIKE</h1>
        <a routerLink="/cuenta" class="icon-btn">Cuenta</a>
      </div>
    </header>

    <main class="deposit-page">
      <a routerLink="/app" class="back-link">← Volver al inicio</a>
      <section class="intro">
        <span class="eyebrow">DEPÓSITOS</span>
        <h2>Depósito con contador automático</h2>
        <p>Selecciona un conteo reciente del dispositivo y valida la cuenta antes de confirmar.</p>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div><span class="step">01</span><h3>Validar depósito</h3></div>
          <span class="status" [class.online]="backendDisponible">{{ backendComprobado ? (backendDisponible ? 'Backend disponible' : 'Backend sin conexión') : 'Comprobando backend…' }}</span>
        </div>

        @if (!token) {
          <p class="message error">Inicia sesión para validar y confirmar un depósito.</p>
          <a routerLink="/login" class="back-link">Ir a iniciar sesión</a>
        } @else if (!resumen) {
          <label for="cuenta">Número de cuenta</label>
          <input id="cuenta" name="cuenta" [(ngModel)]="numeroCuenta" [disabled]="!!operacionId" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="Ingresa los 10 dígitos de la cuenta">

          <label for="conteo">Conteo registrado por un dispositivo autorizado</label>
          <div class="count-controls">
            <select id="conteo" name="conteo" [(ngModel)]="contadorId" [disabled]="!!operacionId">
              <option [ngValue]="null">Selecciona un conteo disponible</option>
              @for (conteo of conteos; track conteo.id) {
                <option [ngValue]="conteo.id">
                  #{{ conteo.id }} · {{ conteo.cantidad_billetes }} billetes · {{ conteo.dispositivo_id }} · {{ conteo.created_at | date:'short' }}
                </option>
              }
            </select>
            <button class="secondary" type="button" [disabled]="cargandoConteos || !!operacionId" (click)="cargarConteos()">
              {{ cargandoConteos ? 'Actualizando…' : 'Actualizar' }}
            </button>
          </div>

          @if (conteos.length === 0 && !cargandoConteos) {
            <p class="muted">No hay conteos recientes disponibles. El contador debe enviar el lote autorizado primero.</p>
          }

          <label for="denominacion">Denominación del lote</label>
          <select id="denominacion" name="denominacion" [(ngModel)]="denominacion" [disabled]="!!operacionId">
            <option [ngValue]="20">$20 MXN</option>
            <option [ngValue]="50">$50 MXN</option>
            <option [ngValue]="100">$100 MXN</option>
            <option [ngValue]="200">$200 MXN</option>
            <option [ngValue]="500">$500 MXN</option>
          </select>

          @if (conteoSeleccionado) {
            <div class="estimate">
              <span>Estimación informativa · {{ conteoSeleccionado.cantidad_billetes }} billetes</span>
              <strong>{{ (denominacion * conteoSeleccionado.cantidad_billetes) | currency:'MXN':'symbol':'1.2-2' }}</strong>
            </div>
          }

          <button class="primary" type="button" [disabled]="validando || !formularioValido" (click)="validarDeposito()">
            {{ validando ? 'Validando…' : (operacionId ? 'Reintentar validación' : 'Validar y mostrar resumen') }}
          </button>
        } @else {
          <div class="summary">
            <p><span>Cuenta</span><strong>{{ resumen.numero_cuenta }}</strong></p>
            <p><span>Denominación</span><strong>{{ resumen.denominacion | currency:'MXN':'symbol':'1.0-0' }}</strong></p>
            <p><span>Billetes</span><strong>{{ resumen.cantidad_billetes }}</strong></p>
            <p class="total"><span>Importe calculado por el servidor</span><strong>{{ resumen.importe | currency:'MXN':'symbol':'1.2-2' }}</strong></p>
          </div>
          <p class="muted">El saldo solo se actualizará al confirmar. Revisa los datos antes de continuar.</p>
          <button class="primary" type="button" [disabled]="confirmando" (click)="confirmarDeposito()">
            {{ confirmando ? 'Confirmando…' : 'Confirmar depósito' }}
          </button>
          <button class="secondary cancel" type="button" [disabled]="confirmando" (click)="cancelarValidacion()">Cancelar y volver</button>
        }

        @if (mensaje) {
          <p class="message" [class.error]="error" role="status">{{ mensaje }}</p>
        }
        @if (saldoActualizado !== null) {
          <div class="summary" role="status">
            <p><span>Saldo actualizado</span><strong>{{ saldoActualizado | currency:'MXN':'symbol':'1.2-2' }}</strong></p>
            <p><span>Movimiento registrado</span><strong>Depósito · {{ importeConfirmado | currency:'MXN':'symbol':'1.2-2' }}</strong></p>
          </div>
        }
      </section>

      <p class="notice"><strong>Seguridad:</strong> este flujo no acepta conteos manuales del navegador ni montos del cliente. Solo aparecen conteos recientes registrados por dispositivos autorizados; el backend comprueba que la cuenta pertenezca a la sesión y registra saldo, depósito e historial en una transacción. El dispositivo debe comunicarse con la API mediante un intermediario seguro.</p>
    </main>
  `,
  styles: [`
    :host { display:block; min-height:100vh; background:var(--bg, #080b10); color:var(--text, #f5f5f5); }
    .deposit-page { width:min(960px, calc(100% - 32px)); margin:28px auto 60px; }
    .back-link { display:inline-block; margin-bottom:22px; color:var(--muted, #aab2bf); text-decoration:none; }
    .intro { margin-bottom:24px; } .eyebrow { color:#d4af37; font-size:.75rem; letter-spacing:.16em; font-weight:800; }
    h2 { margin:8px 0; font-size:clamp(1.7rem,4vw,2.5rem); } .intro p,.muted { color:var(--muted,#aab2bf); }
    .panel { padding:24px; margin:18px 0; border:1px solid rgba(212,175,55,.22); border-radius:20px; background:rgba(255,255,255,.035); }
    .panel-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:22px; }
    .panel-heading>div { display:flex; align-items:center; gap:12px; } h3 { margin:0; font-size:1.08rem; }
    .step { display:grid; place-items:center; width:34px; height:34px; border-radius:11px; color:#d4af37; background:rgba(212,175,55,.12); font-weight:800; }
    .status { font-size:.78rem; color:#e3a4a4; } .status.online { color:#75d6a0; }
    label { display:block; margin:16px 0 7px; color:var(--muted,#aab2bf); font-size:.9rem; }
    input,select { width:100%; box-sizing:border-box; padding:13px 14px; border:1px solid rgba(255,255,255,.15); border-radius:12px; color:var(--text,#f5f5f5); background:#111720; font:inherit; }
    select option { background:#111720; } .count-controls { display:flex; gap:10px; }
    .estimate { display:flex; justify-content:space-between; gap:12px; margin:20px 0; padding:16px; border-radius:12px; background:rgba(212,175,55,.09); }
    .estimate span,.summary span { color:var(--muted,#aab2bf); } .estimate strong { color:#d4af37; }
    .primary,.secondary { border:0; border-radius:12px; padding:14px; font-weight:800; cursor:pointer; }
    .primary { width:100%; background:#d4af37; color:#111; } .secondary { flex:none; background:#27303c; color:#f5f5f5; }
    .primary:disabled,.secondary:disabled { opacity:.45; cursor:not-allowed; }
    .summary { margin:18px 0; padding:16px; border-radius:12px; background:rgba(255,255,255,.04); }
    .summary p { display:flex; justify-content:space-between; gap:16px; margin:8px 0; }
    .summary .total { border-top:1px solid rgba(255,255,255,.12); padding-top:14px; margin-top:14px; }
    .summary .total strong { color:#d4af37; font-size:1.2rem; } .cancel { width:100%; margin-top:10px; }
    .message { margin-bottom:0; color:#75d6a0; } .message.error { color:#ff9c9c; }
    .notice { padding:15px 17px; border-left:3px solid #d4af37; color:var(--muted,#aab2bf); line-height:1.55; background:rgba(255,255,255,.03); }
    @media(max-width:560px) { .panel { padding:17px; } .panel-heading { align-items:flex-start; flex-direction:column; } .estimate { flex-direction:column; } .count-controls { flex-direction:column; } }
  `]
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
