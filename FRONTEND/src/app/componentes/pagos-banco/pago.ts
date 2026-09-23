import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarPago } from './pago-logic';

@Component({
  selector: 'app-pago',
  standalone: true,
  templateUrl: './pago.html',
  styleUrls: ['./pago.css']
})
export class Pago implements AfterViewInit, OnDestroy {
  private limpiarPago?: () => void;

  ngAfterViewInit(): void {
    this.limpiarPago = iniciarPago();
  }

  ngOnDestroy(): void {
    this.limpiarPago?.();
  }
}