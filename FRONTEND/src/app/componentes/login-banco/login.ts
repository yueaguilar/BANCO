import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChangeDetectorRef, Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { RouterLink } from '@angular/router';
import { validarCredencialesCuenta } from './login-logic';

@Component({
  selector: 'app-login-banco',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginBanco {
  loading = false;
  errorMessage = '';
  accountNumber = '';
  password = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  iniciarSesionConCuenta(): void {
    this.errorMessage = '';
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
        localStorage.removeItem('sessionToken');
        if (response.user) localStorage.setItem('user', JSON.stringify(response.user));
        if (response.bankData) localStorage.setItem('bankData', JSON.stringify(response.bankData));
        else localStorage.removeItem('bankData');
        this.cdr.markForCheck();
        void this.router.navigate(['/app']);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error?.error?.message || 'No se pudo iniciar sesión.';
        this.cdr.markForCheck();
      }
    });
  }
}