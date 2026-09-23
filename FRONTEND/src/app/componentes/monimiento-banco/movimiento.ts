import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarNavIndicador } from '../nav-indicator';
import { iniciarApp } from './movimientos-logic';

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
    iniciarApp();
  }

  ngOnDestroy(): void {
    this.limpiarNav?.();
  }
}