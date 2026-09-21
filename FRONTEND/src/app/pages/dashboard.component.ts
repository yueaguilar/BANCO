import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/app" aria-label="Ir al inicio"><img src="/aseets/logo2.png" alt="logo" class="logo"></a>
        <h1 class="brand">LCDKK</h1>
        <a routerLink="/cuenta" class="icon-btn" id="profileBtn">Perfil</a>
      </div>
    </header>

    <main class="container">
      <section class="balance-card">
        <div class="balance-left">
          <p class="small">Saldo disponible</p>
          <h2>{{ balance }}</h2>
        </div>
        <div class="balance-right">
          <button class="primary" type="button" (click)="goTo('/pago')">Pagar</button>
          <button class="outline" type="button" (click)="goTo('/transferir')">Transferir</button>
        </div>
      </section>

      <section class="quick-actions">
        <button class="action" type="button" (click)="goTo('/cuenta')">Depositar</button>
        <button class="action" type="button" (click)="goTo('/recarga')">Recargar celular</button>
        <button class="action" type="button" (click)="goTo('/servicios')">Servicios</button>
        <button class="action" type="button" (click)="goTo('/qr')">Generar QR</button>
      </section>

      <section class="transactions">
        <div class="transactions-header">
          <h3>Últimas actividades</h3>
          <button type="button" class="link-btn" (click)="showAll()">Ver Todas</button>
        </div>
        <ul class="tx-list">
          <li *ngIf="transactions.length === 0" class="tx-item empty-state">
            <div class="tx-meta">
              <div>Sin movimientos aún</div>
              <div class="small">Tu historial aparecerá aquí</div>
            </div>
          </li>
          <li *ngFor="let tx of transactions.slice(0, 3)" class="tx-item">
            <div class="tx-left">
              <div class="tx-icon">{{ tx.title?.charAt(0) || 'M' }}</div>
              <div class="tx-meta">
                <div>{{ tx.title || 'Movimiento' }}</div>
                <div class="small">{{ tx.date || 'Reciente' }}</div>
              </div>
            </div>
            <div class="tx-amount">{{ tx.amount || '' }}</div>
          </li>
        </ul>
      </section>
    </main>

    <nav class="bottom-nav">
      <span class="nav-indicator" aria-hidden="true"></span>
      <a routerLink="/app" class="nav-item active">Inicio</a>
      <a routerLink="/movimientos" class="nav-item">Movimientos</a>
      <a routerLink="/cuenta" class="nav-item">Cuenta</a>
      <a routerLink="/mas" class="nav-item">Más</a>
    </nav>

    <div class="modal" [class.hidden]="!showModal">
      <div class="modal-panel">
        <button type="button" class="close" (click)="closeModal()">×</button>
        <h3>Historial completo</h3>
        <ul class="tx-list">
          <li *ngIf="transactions.length === 0" class="tx-item empty-state">
            <div class="tx-meta"><div>Sin movimientos aún</div></div>
          </li>
          <li *ngFor="let tx of transactions" class="tx-item">
            <div class="tx-left">
              <div class="tx-icon">{{ tx.title?.charAt(0) || 'M' }}</div>
              <div class="tx-meta">
                <div>{{ tx.title || 'Movimiento' }}</div>
                <div class="small">{{ tx.date || 'Reciente' }}</div>
              </div>
            </div>
            <div class="tx-amount">{{ tx.amount || '' }}</div>
          </li>
        </ul>
      </div>
    </div>

    <div class="toast" [class.hidden]="!showToast" role="status" aria-live="polite">
      Pago realizado con éxito
    </div>
  `,
  styles: [
    `
      :host { display:block; min-height:100vh; background:#f4f7fb; color:#1a2433; font-family:Arial,sans-serif; }
      * { box-sizing: border-box; }
      a { text-decoration:none; }
      .topbar { position:sticky; top:0; z-index:10; background: rgba(14,31,50,0.94); backdrop-filter: blur(18px); }
      .topbar-inner { max-width: 1120px; margin: 0 auto; padding: 14px 18px; display:flex; align-items:center; justify-content:space-between; }
      .logo { width: 42px; height: 42px; border-radius: 12px; }
      .brand { margin:0; color:#fff; font-size:1.5rem; }
      .icon-btn { color:#fff; background: rgba(255,255,255,0.12); padding: 10px 14px; border-radius: 12px; }
      .container { max-width: 1120px; margin: 0 auto; padding: 22px 18px 94px; }
      .balance-card { background: linear-gradient(135deg, #0b1c2d, #183a56); color:#fff; border-radius: 28px; padding: 22px; display:flex; justify-content:space-between; gap:18px; box-shadow: 0 14px 30px rgba(13,18,34,.18); }
      .balance-left h2 { margin: 6px 0 0; font-size: clamp(1.8rem, 5vw, 2.6rem); }
      .small { font-size: 0.8rem; opacity:0.8; margin:0; }
      .balance-right { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
      .primary, .outline, .action, .link-btn, .close { border:none; border-radius: 12px; cursor:pointer; }
      .primary { background:#5eead4; color:#072033; padding: 12px 18px; font-weight:700; }
      .outline { background: transparent; color:#fff; border:1px solid rgba(255,255,255,0.35); padding: 12px 18px; }
      .quick-actions { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:12px; margin-top:18px; }
      .action { background:#fff; color:#1a2433; padding:16px 12px; box-shadow: 0 10px 25px rgba(22,33,51,0.06); }
      .transactions { margin-top:22px; background:#fff; border-radius: 22px; padding: 18px; box-shadow: 0 10px 25px rgba(22,33,51,0.06); }
      .transactions-header { display:flex; justify-content:space-between; align-items:center; }
      .link-btn { background: transparent; color:#0b5bd3; font-weight:700; }
      .tx-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px; }
      .tx-item { display:flex; justify-content:space-between; align-items:center; gap:12px; padding: 12px 0; border-bottom:1px solid #edf1f7; }
      .tx-item:last-child { border-bottom:none; }
      .tx-left { display:flex; align-items:center; gap:12px; }
      .tx-icon { width: 32px; height: 32px; border-radius: 10px; background: #eaf3ff; display:grid; place-items:center; font-weight:700; color:#0b5bd3; }
      .tx-meta { display:flex; flex-direction:column; }
      .tx-amount { font-weight:700; }
      .bottom-nav {
        position: fixed; left:50%; bottom:16px; transform:translateX(-50%); width:min(92vw, 520px); display:grid; grid-template-columns: repeat(4, minmax(0,1fr));
        align-items:center; background: rgba(9,20,33,0.95); border-radius: 18px; padding: 8px 10px; box-shadow: 0 18px 38px rgba(0,0,0,0.22);
      }
      .nav-item { color:#d9ebff; text-align:center; padding: 10px 8px; position:relative; z-index:1; }
      .nav-item.active { color:#091421; }
      .nav-indicator { position:absolute; height: calc(100% - 12px); left:0; top:6px; width:0; background:#fff; border-radius:12px; transition: transform .2s ease, width .2s ease; }
      .modal { position: fixed; inset:0; background: rgba(3,10,18,0.5); display:grid; place-items:center; padding:20px; }
      .modal.hidden, .toast.hidden { display:none; }
      .modal-panel { width:min(100%, 520px); background:#fff; border-radius:24px; padding: 18px; position:relative; }
      .close { position:absolute; right:18px; top:18px; background:#efeff6; width:36px; height:36px; border-radius:50%; }
      .toast { position: fixed; left:50%; bottom:120px; transform:translateX(-50%); background:#0b5bd3; color:#fff; padding:10px 16px; border-radius:999px; box-shadow:0 12px 24px rgba(11,91,211,0.3); }
      @media (max-width: 640px) { .quick-actions { grid-template-columns: repeat(2, minmax(0,1fr)); } .balance-card { flex-direction:column; } }
    `
  ]
})
export class DashboardComponent implements OnInit {
  balance = 'Cargando saldo...';
  transactions: any[] = [];
  showModal = false;
  showToast = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    const query = new URLSearchParams(window.location.search);
    if (query.get('payment') === 'success' || query.get('transfer') === 'success' || query.get('recharge') === 'success' || query.get('service') === 'success') {
      this.showToast = true;
      setTimeout(() => this.showToast = false, 2600);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    this.loadSession();
  }

  async loadSession(): Promise<void> {
    let parsedUser: any = null;
    let parsedBank: any = null;

    try {
      parsedUser = JSON.parse(localStorage.getItem('user') || 'null');
      parsedBank = JSON.parse(localStorage.getItem('bankData') || 'null');
    } catch {
      parsedUser = null;
      parsedBank = null;
    }

    if (!parsedUser?.email) {
      this.balance = 'Sin saldo disponible';
      return;
    }

    if (!parsedBank) {
      try {
        const response = await fetch(`/api/session?email=${encodeURIComponent(parsedUser.email)}`);
        const data = await response.json();
        if (response.ok && data.success) {
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('bankData', JSON.stringify(data.bankData));
          parsedBank = data.bankData;
        }
      } catch (error) {
        console.warn('No se pudo actualizar la sesión desde la base de datos', error);
      }
    }

    this.balance = parsedBank ? this.formatMoney(parsedBank.saldo) : 'Sin saldo disponible';
    this.transactions = [];
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value || 0));
  }

  showAll(): void {
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  goTo(path: string): void {
    this.router.navigate([path]);
  }
}
