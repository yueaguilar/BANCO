import { AfterViewInit, Component } from '@angular/core';

@Component({
  selector: 'app-recarga',
  standalone: true,
  templateUrl: './recarga.html',
  styleUrls: ['./recarga.css']
})
export class Recarga implements AfterViewInit {
  ngAfterViewInit(): void {
    // Pega aquí la lógica de recarga.js
  }
}