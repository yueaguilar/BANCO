import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarNavIndicador } from '../nav-indicator';

@Component({
  selector: 'app-cuenta',
  standalone: true,
  templateUrl: './cuenta.html',
  styleUrls: ['./cuenta.css']
})
export class Cuenta implements AfterViewInit, OnDestroy {
  private limpiarNav?: () => void;

  ngAfterViewInit(): void {
    this.limpiarNav = iniciarNavIndicador();
    // Pega aquí la lógica de cuenta.js
  }

  ngOnDestroy(): void {
    this.limpiarNav?.();
  }
}