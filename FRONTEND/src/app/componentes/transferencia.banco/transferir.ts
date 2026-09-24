import { AfterViewInit, Component } from '@angular/core';
import { iniciarTransferir } from './transferir-logic';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-transferir',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './transferir.html',
  styleUrls: ['./transefir.css']
})
export class Transferir implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarTransferir();
  }
}