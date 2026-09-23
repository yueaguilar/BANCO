import { AfterViewInit, Component } from '@angular/core';
import { iniciarQr } from './qr-logic';

@Component({
  selector: 'app-qr',
  standalone: true,
  templateUrl: './qr.html',
  styleUrls: ['./qr.css']
})
export class Qr implements AfterViewInit {
  ngAfterViewInit(): void {
    iniciarQr();
  }
}