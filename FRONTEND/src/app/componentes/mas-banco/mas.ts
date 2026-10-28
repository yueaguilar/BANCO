import {
  AfterViewInit,
  Component,
  OnDestroy
} from '@angular/core';

import { iniciarNavIndicador } from '../nav-indicator';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-mas',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './mas.html',
  styleUrls: ['./mas.css']
})
export class Mas implements AfterViewInit, OnDestroy {

  private limpiarNav?: () => void;
  private limpiarModales: Array<() => void> = [];

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