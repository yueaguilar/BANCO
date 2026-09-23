import { AfterViewInit, Component } from '@angular/core';

@Component({
  selector: 'app-servicios',
  standalone: true,
  templateUrl: './srevicios.html',
  styleUrls: ['./servicios.css']
})
export class Servicios implements AfterViewInit {
  ngAfterViewInit(): void {
    // Pega aquí la lógica de servicios.js
  }
}