import { AfterViewInit, Component } from '@angular/core';
import { iniciarServicios } from './servicios-logic';

@Component({
  selector: 'app-servicios',
  standalone: true,
  templateUrl: './srevicios.html',
  styleUrls: ['./servicios.css']
})
export class Servicios implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarServicios();
  }
}