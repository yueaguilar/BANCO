import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarNavIndicador } from '../nav-indicator';
import { iniciarApp } from './cuenta-logic';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cuenta',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cuenta.html',
  styleUrls: ['./cuenta.css']
})
export class Cuenta implements AfterViewInit, OnDestroy {
  private limpiarNav?: () => void;
  private limpiarCuenta?: () => void;
  private destruido = false;

  ngAfterViewInit(): void {
    this.destruido = false;
    this.limpiarNav = iniciarNavIndicador();
    void iniciarApp().then((limpiarCuenta) => {
      if (this.destruido) {
        limpiarCuenta();
      } else {
        this.limpiarCuenta = limpiarCuenta;
      }
    });
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.limpiarNav?.();
    this.limpiarCuenta?.();
  }
}