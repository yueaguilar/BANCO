import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarScan } from './scan-logic';
  import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './scan.html',
  styleUrls: ['./scan.css']
})
export class Scan implements AfterViewInit, OnDestroy {
  private limpiarScan?: () => void;

  ngAfterViewInit(): void {
    this.limpiarScan = iniciarScan();
  }

  ngOnDestroy(): void {
    this.limpiarScan?.();
  }
}