import { AfterViewInit, Component } from '@angular/core';
import { iniciarVerificacion } from './veri-logic';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-verificacion',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './veri.html',
  styleUrls: ['./veri.css']
})
export class Verificacion implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarVerificacion();
  }
}