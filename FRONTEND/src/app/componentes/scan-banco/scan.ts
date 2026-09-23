import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { iniciarScan } from './scan-logic';

@Component({
  selector: 'app-scan',
  standalone: true,
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