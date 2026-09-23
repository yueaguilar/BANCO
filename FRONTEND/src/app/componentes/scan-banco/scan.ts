import { AfterViewInit, Component } from '@angular/core';

@Component({
  selector: 'app-scan',
  standalone: true,
  templateUrl: './scan.html',
  styleUrls: ['./scan.css']
})
export class Scan implements AfterViewInit {
  ngAfterViewInit(): void {
    // Pega aquí la lógica de scan.js
  }
}