import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard.component';
import { LoginComponent } from './pages/login.component';
import { VerifyComponent } from './pages/verify.component';
import { PlaceholderComponent } from './pages/placeholder.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'verify', component: VerifyComponent },
  { path: 'app', component: DashboardComponent },
  { path: 'cuenta', component: PlaceholderComponent },
  { path: 'movimientos', component: PlaceholderComponent },
  { path: 'pago', component: PlaceholderComponent },
  { path: 'transferir', component: PlaceholderComponent },
  { path: 'recarga', component: PlaceholderComponent },
  { path: 'servicios', component: PlaceholderComponent },
  { path: 'qr', component: PlaceholderComponent },
  { path: 'mas', component: PlaceholderComponent },
  { path: '**', redirectTo: 'login' }
];
