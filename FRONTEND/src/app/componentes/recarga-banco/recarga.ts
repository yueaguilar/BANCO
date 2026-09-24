import { AfterViewInit, Component } from '@angular/core';
import { iniciarRecarga } from './recarga-logic';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-recarga',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './recarga.html',
  styleUrls: ['./recarga.css']
})
export class Recarga implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarRecarga();
  }
}