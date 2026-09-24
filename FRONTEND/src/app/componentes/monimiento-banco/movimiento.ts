import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarNavIndicador } from '../nav-indicator';
import { iniciarApp } from './movimientos-logic';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-movimientos',
  standalone: true,
  imports: [RouterLink],
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