import {
  AfterViewInit,
  Component,
  OnDestroy
} from '@angular/core';

import { iniciarNavIndicador } from '../nav-indicator';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-mas',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './mas.html',
  styleUrls: ['./mas.css']
})
export class Mas implements AfterViewInit, OnDestroy {

  private limpiarNav?: () => void;

  ngAfterViewInit(): void {
    this.limpiarNav = iniciarNavIndicador();
  }

  ngOnDestroy(): void {
    this.limpiarNav?.();
  }
}