import { AfterViewInit, Component } from '@angular/core';
import { iniciarTransferir } from './transferir-logic';

@Component({
  selector: 'app-transferir',
  standalone: true,
  templateUrl: './transferir.html',
  styleUrls: ['./transefir.css']
})
export class Transferir implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarTransferir();
  }
}