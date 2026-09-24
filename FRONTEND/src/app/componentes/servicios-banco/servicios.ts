import { AfterViewInit, Component } from '@angular/core';
import { iniciarServicios } from './servicios-logic';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-servicios',
  standalone: true,
   imports: [RouterLink],
  templateUrl: './srevicios.html',
  styleUrls: ['./servicios.css']
})
export class Servicios implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarServicios();
  }
}