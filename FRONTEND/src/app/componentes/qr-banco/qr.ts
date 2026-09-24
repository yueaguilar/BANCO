import { AfterViewInit, Component } from '@angular/core';
import { iniciarQr } from './qr-logic';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-qr',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './qr.html',
  styleUrls: ['./qr.css']
})
export class Qr implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarQr();
  }
}