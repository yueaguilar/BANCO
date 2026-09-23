import { AfterViewInit, Component } from '@angular/core';

@Component({
  selector: 'app-qr',
  standalone: true,
  templateUrl: './qr.html',
  styleUrls: ['./qr.css']
})
export class Qr implements AfterViewInit {
  ngAfterViewInit(): void {
    // Pega aquí la lógica de qr.js
  }
}