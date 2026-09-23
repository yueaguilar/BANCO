import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarNavIndicador } from '../nav-indicator';
import { iniciarApp } from './cuenta-logic';

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
    iniciarApp();
  }

  ngOnDestroy(): void {
    this.limpiarNav?.();
  }
}