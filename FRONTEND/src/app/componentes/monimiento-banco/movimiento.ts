import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarNavIndicador } from '../nav-indicator';

@Component({
  selector: 'app-movimientos',
  standalone: true,
  templateUrl: './movimientos.html',
  styleUrls: ['./movimientos.css']
})
export class Movimientos implements AfterViewInit, OnDestroy {
  private limpiarNav?: () => void;

  ngAfterViewInit(): void {
    this.limpiarNav = iniciarNavIndicador();
    // Pega aquí la lógica de movimientos.js
  }

  ngOnDestroy(): void {
    this.limpiarNav?.();
  }
}