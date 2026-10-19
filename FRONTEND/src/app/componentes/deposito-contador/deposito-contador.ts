import { Component } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContadorService, RegistroContador } from '../../services/contador.service';

@Component({
  selector: 'app-deposito-contador',
  standalone: true,
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe],
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/app" aria-label="Volver al inicio"><img src="/img/logo.png" alt="Banco KIKE" class="logo"></a>
        <h1 class="brand">Banco KIKE</h1>
        <a routerLink="/cuenta" class="icon-btn">Cuenta</a>
      </div>
    </header>

    <main class="deposit-page">
      <a routerLink="/app" class="back-link">← Volver al inicio</a>
      <section class="intro">
        <span class="eyebrow">DEPÓSITOS</span>
        <h2>Depósito con contador automático</h2>
        <p>Prepara un lote de billetes y registra el conteo recibido del dispositivo.</p>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div><span class="step">01</span><h3>Datos del depósito</h3></div>
          <span class="status" [class.online]="backendDisponible">{{ backendComprobado ? (backendDisponible ? 'Backend disponible' : 'Backend sin conexión') : 'Comprobando backend…' }}</span>
        </div>

        <label for="cuenta">Número completo de cuenta</label>
        <input id="cuenta" name="cuenta" [(ngModel)]="numeroCuenta" inputmode="numeric" autocomplete="off" placeholder="Escribe el número de cuenta">

        <label for="denominacion">Denominación del lote</label>
        <select id="denominacion" name="denominacion" [(ngModel)]="denominacion">
          <option [ngValue]="20">$20 MXN</option>
          <option [ngValue]="50">$50 MXN</option>
          <option [ngValue]="100">$100 MXN</option>
          <option [ngValue]="200">$200 MXN</option>
          <option [ngValue]="500">$500 MXN</option>
        </select>

        <label for="esperados">Cantidad esperada de billetes</label>
        <input id="esperados" name="esperados" type="number" min="1" max="10000" [(ngModel)]="cantidadEsperada" placeholder="Ej. 25">

        <div class="estimate">
          <span>Importe estimado del lote</span>
          <strong>{{ (denominacion * (cantidadEsperada || 0)) | currency:'MXN':'symbol':'1.2-2' }}</strong>
        </div>

        <button class="primary" type="button" [disabled]="enviando || !formularioValido" (click)="registrarPrueba()">
          {{ enviando ? 'Registrando conteo…' : 'Registrar conteo recibido' }}
        </button>
        @if (mensaje) {
          <p class="message" [class.error]="error" role="status">{{ mensaje }}</p>
        }
      </section>

      <section class="panel count-panel">
        <div class="panel-heading"><div><span class="step">02</span><h3>Último conteo registrado</h3></div></div>
        @if (ultimoRegistro) {
          <div class="count-number">{{ ultimoRegistro.cantidad_billetes }}</div>
          <p>Billetes · Dispositivo {{ ultimoRegistro.dispositivo_id }}</p>
          <small>{{ ultimoRegistro.fecha_hora | date:'medium' }}</small>
        } @else {
          <p class="muted">Todavía no hay un conteo registrado desde esta pantalla.</p>
        }
      </section>

      <p class="notice"><strong>Integración en desarrollo:</strong> este formulario registra un conteo en el backend. Todavía no confirma un depósito, no valida la cuenta y no modifica el saldo. La cantidad definitiva deberá recibirse desde los dos Arduino y validarse en Node.js antes de registrar el depósito.</p>
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
    select option { background:#111720; } .estimate { display:flex; justify-content:space-between; gap:12px; margin:20px 0; padding:16px; border-radius:12px; background:rgba(212,175,55,.09); }
    .estimate span { color:var(--muted,#aab2bf); } .estimate strong { color:#d4af37; }
    .primary { width:100%; border:0; border-radius:12px; padding:14px; background:#d4af37; color:#111; font-weight:800; cursor:pointer; }
    .primary:disabled { opacity:.45; cursor:not-allowed; } .message { margin-bottom:0; color:#75d6a0; } .message.error { color:#ff9c9c; }
    .count-number { font-size:3rem; font-weight:800; color:#d4af37; } .count-panel p { margin:4px 0 8px; } small { color:var(--muted,#aab2bf); }
    .notice { padding:15px 17px; border-left:3px solid #d4af37; color:var(--muted,#aab2bf); line-height:1.55; background:rgba(255,255,255,.03); }
    @media(max-width:560px) { .panel { padding:17px; } .panel-heading { align-items:flex-start; flex-direction:column; } .estimate { flex-direction:column; } }
  `]
})
export class DepositoContador {
  numeroCuenta = '';
  denominacion = 100;
  cantidadEsperada: number | null = 1;
  enviando = false;
  mensaje = '';
  error = false;
  backendComprobado = false;
  backendDisponible = false;
  ultimoRegistro: RegistroContador | null = null;

  constructor(private readonly contadorService: ContadorService) {
    void this.comprobarConexion();
  }

  get formularioValido(): boolean {
    return /^\d{6,20}$/.test(this.numeroCuenta.trim())
      && Number.isInteger(this.cantidadEsperada)
      && Number(this.cantidadEsperada) > 0
      && Number(this.cantidadEsperada) <= 10000;
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

  async registrarPrueba(): Promise<void> {
    if (!this.formularioValido || this.enviando) return;
    this.enviando = true;
    this.mensaje = '';
    this.error = false;
    try {
      const respuesta = await this.contadorService.registrarConteo('CONTADOR_KIKE_01', Number(this.cantidadEsperada));
      this.ultimoRegistro = respuesta.data ?? null;
      this.mensaje = respuesta.message + ' (registro de conteo únicamente; no es un depósito).';
    } catch (e) {
      this.error = true;
      this.mensaje = e instanceof Error ? e.message : 'No se pudo conectar con el backend.';
    } finally {
      this.enviando = false;
    }
  }
}
