import {
  AfterViewInit,
  Component,
  OnDestroy
} from '@angular/core';

import { RouterLink } from '@angular/router';

import { iniciarNavIndicador } from '../nav-indicator';
import { iniciarApp } from './app-logic';

@Component({
  selector: 'app-principal',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class Principal implements AfterViewInit, OnDestroy {

  private limpiarNav?: () => void;

  ngAfterViewInit(): void {
    this.limpiarNav = iniciarNavIndicador();

    iniciarApp();
  }

  ngOnDestroy(): void {
    this.limpiarNav?.();
  }
}