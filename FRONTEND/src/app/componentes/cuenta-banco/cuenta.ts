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

  ngAfterViewInit(): void {
    this.limpiarNav = iniciarNavIndicador();
    iniciarApp();
  }

  ngOnDestroy(): void {
    this.limpiarNav?.();
  }
}