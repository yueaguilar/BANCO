import { AfterViewInit, Component } from '@angular/core';
import { iniciarVerificacion } from './veri-logic';

@Component({
  selector: 'app-verificacion',
  standalone: true,
  templateUrl: './veri.html',
  styleUrls: ['./veri.css']
})
export class Verificacion implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarVerificacion();
  }
}