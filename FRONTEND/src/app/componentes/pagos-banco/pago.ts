import { AfterViewInit, Component } from '@angular/core';

@Component({
  selector: 'app-pago',
  standalone: true,
  templateUrl: './pago.html',
  styleUrls: ['./pago.css']
})
export class Pago implements AfterViewInit {
  ngAfterViewInit(): void {
    // Pega aquí la lógica de pago.js
  }
}