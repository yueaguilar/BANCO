import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="inicio">
      <h1 id="titulo">Inicio de sesion o Regsitro de nueva cuenta</h1>
    </div>
    <div class="info">
      <form class="login-form" (ngSubmit)="submit()">
        <input class="correo liquid-glass-input" type="email" name="email" [(ngModel)]="form.email" placeholder="Correo electrónico" required>
        <input class="liquid-glass-input" type="text" name="fullname" [(ngModel)]="form.fullname" placeholder="Nombre completo">
        <label class="small">Fecha de nacimiento</label>
        <input class="liquid-glass-input" type="date" name="birthdate" [(ngModel)]="form.birthdate">
        <input class="liquid-glass-input" type="tel" inputmode="numeric" maxlength="10" name="phone" [(ngModel)]="form.phone" (input)="sanitizePhone()" placeholder="Número de celular (10 dígitos)" required>
        <div style="display:flex;align-items:center;gap:8px;">
          <input class="liquid-glass-input" [type]="showPassword ? 'text' : 'password'" name="password" [(ngModel)]="form.password" placeholder="Contraseña" required>
          <label style="font-size:0.9rem;display:flex;align-items:center;gap:6px;">
            <input type="checkbox" [(ngModel)]="showPassword" name="toggle-password"> Mostrar
          </label>
        </div>
        <button type="submit" class="correo liquid-glass-btn">Enviar código y continuar</button>
      </form>
    </div>
  `,
  styles: [
    `
      * { box-sizing: border-box; }
      body { margin: 0; }
      :host {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: radial-gradient(circle at top, #1f3f5f 0%, #0d1b2a 42%, #091421 100%);
        color: #edf6ff;
        font-family: Arial, sans-serif;
      }
      .inicio {
        width: min(100%, 700px);
        background: linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06));
        border: 1px solid rgba(255,255,255,0.24);
        border-radius: 24px;
        box-shadow: 0 18px 48px rgba(0,0,0,0.28);
        backdrop-filter: blur(18px);
        padding: 30px 24px;
        text-align: center;
        margin-bottom: 18px;
      }
      #titulo {
        margin: 0;
        font-size: clamp(1.6rem, 2vw, 2.2rem);
        color: #90e0ef;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      #titulo::after {
        content: "";
        display: inline-block;
        width: 150px;
        height: 64px;
        background-image: url('/aseets/logo.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }
      .info {
        width: min(100%, 620px);
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 24px;
        box-shadow: 0 18px 48px rgba(0,0,0,0.24);
      }
      .login-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .liquid-glass-input {
        width: 100%;
        background: linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08));
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.5);
        color: #edf6ff;
        padding: 14px 16px;
        outline: none;
        transition: all .2s ease;
      }
      .liquid-glass-input::placeholder { color: rgba(237,246,255,0.7); }
      .liquid-glass-input:hover,
      .liquid-glass-input:focus {
        transform: translateY(-2px);
        box-shadow: 0 14px 40px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.6);
        border-color: #90e0ef;
      }
      .liquid-glass-btn {
        width: 100%;
        background: linear-gradient(135deg, rgba(255,255,255,0.26), rgba(255,255,255,0.08));
        border: 1px solid rgba(255,255,255,0.35);
        border-radius: 18px;
        box-shadow: 0 12px 36px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.5);
        color: #edf6ff;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.25s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 15px 18px;
      }
      .liquid-glass-btn:hover { background: linear-gradient(135deg, rgba(255,255,255,0.35), rgba(255,255,255,0.15)); transform: translateY(-2px); }
      .small { font-size: 0.9rem; color: #dfeaf8; }
      @media (max-width: 520px) { :host { padding: 16px; } .inicio, .info { padding: 18px 14px; } #titulo::after { width: 110px; height: 48px; } }
    `
  ]
})
export class LoginComponent {
  form = {
    email: '',
    fullname: '',
    birthdate: '',
    phone: '',
    password: ''
  };

  showPassword = false;

  constructor(private router: Router) {}

  sanitizePhone(): void {
    this.form.phone = this.form.phone.replace(/\D/g, '').slice(0, 10);
  }

  async submit(): Promise<void> {
    if (!this.form.email || !this.form.password) {
      alert('Correo y contraseña son obligatorios.');
      return;
    }

    if (this.form.phone.replace(/\D/g, '').length < 10) {
      alert('Debes ingresar un número de celular válido para recibir el código de verificación.');
      return;
    }

    try {
      const response = await fetch('/api/verification/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: this.form.phone.replace(/\D/g, ''), email: this.form.email })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.message || 'No se pudo enviar el código de verificación.');
        return;
      }

      localStorage.setItem('pendingAuth', JSON.stringify({
        email: this.form.email,
        fullname: this.form.fullname,
        birthdate: this.form.birthdate,
        password: this.form.password,
        phone: this.form.phone.replace(/\D/g, '')
      }));
      localStorage.setItem('verificationPhone', this.form.phone.replace(/\D/g, ''));
      localStorage.setItem('verificationEmail', this.form.email);
      this.router.navigate(['/verify']);
    } catch (error) {
      console.error(error);
      alert('Error en la comunicación con el servidor');
    }
  }
}
