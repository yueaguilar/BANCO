import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="verification-shell">
      <section class="verification-card">
        <div class="brand-wrap">
          <img src="/aseets/logo2.png" alt="Banco Ficticio" class="brand-logo" />
          <h1>Verifica tu identidad</h1>
        </div>

        <p class="lead">
          Te enviamos un código de 6 dígitos al número <strong>{{ phone ? '+52 ' + phone : '-' }}</strong>.
        </p>

        <form class="verification-form" (ngSubmit)="verifyCode()">
          <label for="verification-code">Código de verificación</label>
          <input id="verification-code" class="verification-input" type="text" inputmode="numeric" maxlength="6" name="verificationCode" [(ngModel)]="verificationCode" (input)="sanitizeCode()" placeholder="123456" required>

          <button type="submit" class="primary-btn">Confirmar código</button>
        </form>

        <div class="actions">
          <button type="button" class="secondary-btn" (click)="sendCode()">Reenviar código</button>
          <a href="/login" class="text-link">Cancelar</a>
        </div>
        <p class="status-message" [style.color]="statusError ? '#ffb4b4' : '#d8f3dc'" aria-live="polite">{{ statusMessage }}</p>
      </section>
    </main>
  `,
  styles: [
    `
      :host { display:block; min-height:100vh; }
      * { box-sizing: border-box; }
      body { margin:0; }
      .verification-shell {
        min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
        background: radial-gradient(circle at top, #1f3f5f 0%, #0d1b2a 42%, #091421 100%);
        color: #edf6ff;
        font-family: Arial, sans-serif;
      }
      .verification-card {
        width: min(100%, 480px); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18);
        border-radius: 28px; padding: 32px 24px; box-shadow: 0 18px 48px rgba(0,0,0,0.28);
      }
      .brand-wrap { display:flex; flex-direction:column; align-items:center; gap:12px; margin-bottom:16px; }
      .brand-logo { width: 72px; height: 72px; object-fit: contain; }
      h1 { margin:0; font-size: clamp(1.75rem, 3vw, 2.3rem); text-align:center; }
      .lead { text-align:center; color: rgba(237,246,255,0.85); margin-bottom: 22px; }
      .verification-form { display:flex; flex-direction:column; gap:12px; }
      .verification-form label { color: #dfeaf8; }
      .verification-input {
        width: 100%; background: linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08));
        border: 1px solid rgba(255,255,255,0.3); border-radius: 14px; padding: 14px 16px; color: #edf6ff; font-size: 1.1rem; outline: none;
      }
      .verification-input::placeholder { color: rgba(237,246,255,0.7); }
      .primary-btn, .secondary-btn {
        cursor:pointer; border-radius: 14px; padding: 14px 18px; transition: transform 0.2s ease; font-weight:700; border:none;
      }
      .primary-btn { background: linear-gradient(135deg, rgba(255,255,255,0.26), rgba(255,255,255,0.08)); color: #edf6ff; }
      .secondary-btn { background: transparent; border: 1px solid rgba(255,255,255,0.25); color: #edf6ff; }
      .primary-btn:hover, .secondary-btn:hover { transform: translateY(-1px); }
      .actions { margin-top:16px; display:flex; justify-content:space-between; gap:12px; align-items:center; }
      .text-link { color: #90e0ef; text-decoration:none; }
      .status-message { margin-top:18px; min-height: 24px; text-align:center; }
      @media (max-width: 520px) { .verification-card { padding: 24px 18px; } .actions { flex-direction:column; } }
    `
  ]
})
export class VerifyComponent implements OnInit {
  verificationCode = '';
  phone = '';
  statusMessage = 'Cargando código...';
  statusError = false;
  pendingAuth: any = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.pendingAuth = JSON.parse(localStorage.getItem('pendingAuth') || 'null');
    this.phone = localStorage.getItem('verificationPhone') || this.pendingAuth?.phone || '';
    if (!this.phone) {
      this.statusMessage = 'No se encontró el teléfono para esta sesión.';
      this.statusError = true;
      return;
    }
    this.sendCode();
  }

  sanitizeCode(): void {
    this.verificationCode = this.verificationCode.replace(/\D/g, '').slice(0, 6);
  }

  async sendCode(): Promise<void> {
    if (!this.phone) {
      this.statusMessage = 'No hay un número disponible para verificar.';
      this.statusError = true;
      return;
    }

    try {
      const response = await fetch('/api/verification/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: this.phone, email: this.pendingAuth?.email || localStorage.getItem('verificationEmail') || '' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'No se pudo reenviar el código.');
      }
      this.statusMessage = 'Se reenvió el código correctamente.';
      this.statusError = false;
    } catch (error: any) {
      console.error(error);
      this.statusMessage = error.message || 'Hubo un problema al reenviar el código.';
      this.statusError = true;
    }
  }

  async verifyCode(): Promise<void> {
    if (!this.phone || !this.verificationCode || this.verificationCode.length !== 6) {
      this.statusMessage = 'Ingresa un código de 6 dígitos válido.';
      this.statusError = true;
      return;
    }

    try {
      const verifyResponse = await fetch('/api/verification/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: this.phone, code: this.verificationCode })
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.success) {
        throw new Error(verifyData.message || 'El código es incorrecto.');
      }

      const pending = JSON.parse(localStorage.getItem('pendingAuth') || 'null');
      if (!pending) {
        throw new Error('No hay datos de registro pendientes.');
      }

      const authResponse = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pending, phone: this.phone, verificationCode: this.verificationCode })
      });
      const authData = await authResponse.json();
      if (!authResponse.ok || !authData.success) {
        throw new Error(authData.message || 'No se pudo completar la autenticación.');
      }

      localStorage.setItem('user', JSON.stringify(authData.user));
      if (authData.bankData) localStorage.setItem('bankData', JSON.stringify(authData.bankData));
      localStorage.removeItem('pendingAuth');
      localStorage.removeItem('verificationPhone');
      localStorage.removeItem('verificationEmail');

      this.statusMessage = 'Verificación exitosa. Redirigiendo...';
      this.statusError = false;
      this.router.navigate(['/app']);
    } catch (error: any) {
      console.error(error);
      this.statusMessage = error.message || 'Hubo un problema al verificar el código.';
      this.statusError = true;
    }
  }
}
