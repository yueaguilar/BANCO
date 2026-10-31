import {
  AfterViewInit,
  Component,
  OnInit,
  OnDestroy
} from '@angular/core';

import { iniciarNavIndicador } from '../nav-indicator';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthService, AuthSession } from '../../services/auth.service';

@Component({
  selector: 'app-mas',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mas.html',
  styleUrls: ['./mas.css']
})
export class Mas implements OnInit, AfterViewInit, OnDestroy {

  private limpiarNav?: () => void;
  private limpiarModales: Array<() => void> = [];
  sessions: AuthSession[] = [];
  sessionsLoading = false;
  sessionsError = '';
  sessionActionId = '';
  signingOut = false;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    void this.cargarSesiones();
  }

  ngAfterViewInit(): void {
    this.limpiarNav = iniciarNavIndicador();
    this.limpiarModales = [
      this.conectarModal('securityFraudBtn', 'securityFraudModal', 'closeSecurityFraud'),
      this.conectarModal('savingsInvestmentsBtn', 'savingsInvestmentsModal', 'closeSavingsInvestments'),
      this.conectarModal('prioritySupportBtn', 'prioritySupportModal', 'closePrioritySupport')
    ];
  }

  ngOnDestroy(): void {
    this.limpiarNav?.();
    this.limpiarModales.forEach((limpiar) => limpiar());
  }

  async cargarSesiones(): Promise<void> {
    this.sessionsLoading = true;
    this.sessionsError = '';
    try {
      const response = await firstValueFrom(this.authService.sessions());
      this.sessions = response.sessions || [];
    } catch (error) {
      this.sessionsError = 'No se pudieron consultar las sesiones activas.';
    } finally {
      this.sessionsLoading = false;
    }
  }

  async cerrarSesion(id: string, current: boolean): Promise<void> {
    this.sessionActionId = id;
    this.sessionsError = '';
    try {
      await firstValueFrom(this.authService.revokeSession(id));
      if (current) {
        localStorage.removeItem('user');
        localStorage.removeItem('bankData');
        await this.router.navigate(['/login']);
        return;
      }
      await this.cargarSesiones();
    } catch (error) {
      this.sessionsError = 'No se pudo cerrar esa sesión. Inténtalo nuevamente.';
    } finally {
      this.sessionActionId = '';
    }
  }

  async cerrarTodasLasSesiones(): Promise<void> {
    this.signingOut = true;
    this.sessionsError = '';
    try {
      await firstValueFrom(this.authService.logoutAll());
      await this.router.navigate(['/login']);
    } catch (error) {
      this.sessionsError = 'No se pudieron cerrar todas las sesiones.';
    } finally {
      this.signingOut = false;
    }
  }

  async cerrarSesionActual(): Promise<void> {
    this.signingOut = true;
    this.sessionsError = '';
    try {
      await firstValueFrom(this.authService.logout());
      await this.router.navigate(['/login']);
    } catch (error) {
      this.sessionsError = 'No se pudo cerrar la sesión actual.';
    } finally {
      this.signingOut = false;
    }
  }

  private conectarModal(
    triggerId: string,
    modalId: string,
    closeId: string
  ): () => void {
    const trigger = document.getElementById(triggerId);
    const modal = document.getElementById(modalId);
    const close = document.getElementById(closeId);
    if (!trigger || !modal || !close) return () => {};

    const open = (): void => modal.classList.remove('hidden');
    const dismiss = (): void => modal.classList.add('hidden');
    const onBackdrop = (event: MouseEvent): void => {
      if (event.target === modal) dismiss();
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss();
    };

    trigger.addEventListener('click', open);
    close.addEventListener('click', dismiss);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onEscape);

    return () => {
      trigger.removeEventListener('click', open);
      close.removeEventListener('click', dismiss);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onEscape);
    };
  }
}