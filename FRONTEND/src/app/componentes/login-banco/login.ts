import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ChangeDetectorRef, Component } from '@angular/core';
import { AuthResponse, AuthService } from '../../services/auth.service';
import { validarCredencialesCuenta } from './login-logic';

type LoginStep = 'credentials' | 'code';

@Component({
  selector: 'app-login-banco',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginBanco {
  step: LoginStep = 'credentials';
  loading = false;
  errorMessage = '';
  statusMessage = '';
  phoneHint = '';
  accountNumber = '';
  password = '';
  code = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  iniciarSesionConCuenta(): void {
    this.errorMessage = '';
    this.statusMessage = '';
    const accountNumber = this.accountNumber.trim();
    const validationMessage = validarCredencialesCuenta(accountNumber, this.password);
    if (validationMessage) {
      this.errorMessage = validationMessage;
      return;
    }

    this.loading = true;
    this.authService.login(accountNumber, this.password).subscribe({
      next: (response) => {
        this.loading = false;
        if (!response.success) {
          this.errorMessage = response.message || 'No se pudo iniciar sesión.';
          this.cdr.markForCheck();
          return;
        }
        if (response.requiresVerification) {
          this.phoneHint = response.phoneHint || 'tu teléfono registrado';
          this.step = 'code';
          this.cdr.markForCheck();
          return;
        }
        this.finalizarInicioSesion(response);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error?.error?.message || 'No se pudo iniciar sesión.';
        this.cdr.markForCheck();
      }
    });
  }

  verificarCodigo(): void {
    this.errorMessage = '';
    this.statusMessage = '';
    if (!/^\d{6}$/.test(this.code)) {
      this.errorMessage = 'Ingresa el código SMS de 6 dígitos.';
      return;
    }

    this.loading = true;
    this.authService.verifyLogin(this.accountNumber.trim(), this.password, this.code).subscribe({
      next: (response) => {
        this.loading = false;
        if (!response.success) {
          this.errorMessage = response.message || 'No se pudo verificar el código SMS.';
          this.cdr.markForCheck();
          return;
        }
        this.finalizarInicioSesion(response);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error?.error?.message || 'No se pudo verificar el código SMS.';
        this.cdr.markForCheck();
      }
    });
  }

  reenviarCodigo(): void {
    this.errorMessage = '';
    this.statusMessage = '';
    this.loading = true;
    this.authService.login(this.accountNumber.trim(), this.password).subscribe({
      next: (response) => {
        this.loading = false;
        if (!response.success) {
          this.errorMessage = response.message || 'No se pudo reenviar el código.';
        } else {
          this.phoneHint = response.phoneHint || this.phoneHint;
          this.statusMessage = response.message || 'Se envió un nuevo código SMS.';
        }
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error?.error?.message || 'No se pudo reenviar el código.';
        this.cdr.markForCheck();
      }
    });
  }

  volverACredenciales(): void {
    this.step = 'credentials';
    this.code = '';
    this.errorMessage = '';
    this.statusMessage = '';
  }

  private finalizarInicioSesion(response: AuthResponse): void {
    localStorage.removeItem('sessionToken');
    if (response.user) localStorage.setItem('user', JSON.stringify(response.user));
    if (response.bankData) localStorage.setItem('bankData', JSON.stringify(response.bankData));
    else localStorage.removeItem('bankData');
    this.cdr.markForCheck();
    void this.router.navigate(['/app']);
  }
}