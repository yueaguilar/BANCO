import { Routes } from '@angular/router';
import { LoginBanco } from './componentes/login-banco/login';
import { AppBanco } from './componentes/app-banco/app';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginBanco },
  { path: 'app', component: AppBanco },
];
