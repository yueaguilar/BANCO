import { AfterViewInit, Component } from '@angular/core';
import { iniciarRecarga } from './recarga-logic';

@Component({
  selector: 'app-recarga',
  standalone: true,
  templateUrl: './recarga.html',
  styleUrls: ['./recarga.css']
})
export class Recarga implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarRecarga();
  }
}