import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

type Step = 'form' | 'code';

@Component({
  selector: 'app-login-banco',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginBanco {
  step: Step = 'form';
  loading = false;
  errorMessage = '';
  mostrarPassword = false;

  email = '';
  fullname = '';
  birthdate = '';
  phone = '';
  password = '';
  code = '';

  private readonly apiUrl = '/api';

  constructor(private http: HttpClient, private router: Router) {}

  enviarCodigo(): void {
    this.errorMessage = '';
    this.loading = true;

    this.http.post<any>(`${this.apiUrl}/verification/send`, {
      email: this.email,
      phone: this.phone
    }).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          this.step = 'code';
        } else {
          this.errorMessage = res.message || 'No se pudo enviar el código.';
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err?.error?.message || 'Error al enviar el código de verificación.';
      }
    });
  }

  verificarYAutenticar(): void {
    this.errorMessage = '';
    this.loading = true;

    this.http.post<any>(`${this.apiUrl}/verification/verify`, {
      email: this.email,
      phone: this.phone,
      code: this.code
    }).subscribe({
      next: (res) => {
        if (!res.success) {
          this.loading = false;
          this.errorMessage = res.message || 'Código inválido.';
          return;
        }

        this.http.post<any>(`${this.apiUrl}/auth`, {
          email: this.email,
          fullname: this.fullname,
          birthdate: this.birthdate,
          password: this.password,
          phone: this.phone
        }).subscribe({
          next: (authRes) => {
            this.loading = false;
            if (authRes.success) {
              this.router.navigate(['/app']);
            } else {
              this.errorMessage = authRes.message || 'No se pudo iniciar sesión.';
            }
          },
          error: (err) => {
            this.loading = false;
            this.errorMessage = err?.error?.message || 'Error al iniciar sesión.';
          }
        });
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err?.error?.message || 'Error al verificar el código.';
      }
    });
  }

  volver(): void {
    this.step = 'form';
    this.code = '';
    this.errorMessage = '';
  }
}