import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { API_URL } from '../../api-config';
import { AuthResponse } from '../../services/auth.service';
import { formatearTelefono, normalizarTelefono, validarDatosRegistro } from './signup-logic';

type SignupStep = 'form' | 'code';

interface ApiResponse {
  success: boolean;
  message?: string;
}

@Component({
  selector: 'app-signup-banco',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.css'
})
export class SignupBanco {
  step: SignupStep = 'form';
  loading = false;
  errorMessage = '';
  phoneError = '';
  phoneTouched = false;
  mostrarPassword = false;

  email = '';
  fullname = '';
  birthdate = '';
  phone = '';
  password = '';
  code = '';

  private readonly apiUrl = `${API_URL}/api`;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  actualizarTelefono(): void {
    this.phone = formatearTelefono(this.phone);
    if (this.phoneTouched) this.validarTelefono();
  }

  validarTelefono(): boolean {
    this.phoneTouched = true;
    this.phoneError = normalizarTelefono(this.phone)
      ? ''
      : 'Ingresa +52 y los 10 dígitos de tu celular.';
    return !this.phoneError;
  }

  enviarCodigo(): void {
    this.errorMessage = '';
    const validationMessage = validarDatosRegistro(this.email, this.password, this.phone);
    if (validationMessage) {
      this.errorMessage = validationMessage;
      this.cdr.markForCheck();
      return;
    }

    const phone = normalizarTelefono(this.phone);
    if (!phone) return;

    this.loading = true;
    this.http.post<ApiResponse>(`${this.apiUrl}/verification/send`, { phone }).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.phone = `+52${phone}`;
          this.step = 'code';
        } else {
          this.errorMessage = response.message || 'No se pudo enviar el código.';
        }
        this.cdr.markForCheck();
      },
      error: (error: { error?: { message?: string } }) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Error al enviar el código de verificación.';
        this.cdr.markForCheck();
      }
    });
  }

  verificarYCrearCuenta(): void {
    this.errorMessage = '';
    const phone = normalizarTelefono(this.phone);
    if (!phone || !/^\d{6}$/.test(this.code)) {
      this.errorMessage = 'Ingresa el código SMS de 6 dígitos.';
      return;
    }

    this.loading = true;
    this.http.post<ApiResponse>(`${this.apiUrl}/verification/verify`, {
      phone,
      code: this.code
    }).subscribe({
      next: (verification) => {
        if (!verification.success) {
          this.loading = false;
          this.errorMessage = verification.message || 'El código de verificación no es válido.';
          this.cdr.markForCheck();
          return;
        }

        this.http.post<AuthResponse>(`${this.apiUrl}/auth`, {
          email: this.email.trim(),
          fullname: this.fullname.trim(),
          birthdate: this.birthdate,
          password: this.password,
          phone
        }).subscribe({
          next: (response) => {
            this.loading = false;
            if (!response.success) {
              this.errorMessage = response.message || 'No se pudo crear la cuenta.';
              this.cdr.markForCheck();
              return;
            }

            localStorage.removeItem('sessionToken');
            if (response.user) localStorage.setItem('user', JSON.stringify(response.user));
            else localStorage.setItem('user', JSON.stringify({ email: this.email.trim() }));
            if (response.bankData) localStorage.setItem('bankData', JSON.stringify(response.bankData));
            else localStorage.removeItem('bankData');
            void this.router.navigate(['/app']);
          },
          error: (error: { error?: { message?: string } }) => {
            this.loading = false;
            this.errorMessage = error.error?.message || 'Error al completar el registro.';
            this.cdr.markForCheck();
          }
        });
      },
      error: (error: { error?: { message?: string } }) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Error al verificar el código SMS.';
        this.cdr.markForCheck();
      }
    });
  }

  volverAlFormulario(): void {
    this.step = 'form';
    this.code = '';
    this.errorMessage = '';
  }
}
