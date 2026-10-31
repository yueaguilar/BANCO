import { Routes } from '@angular/router';
import { LoginBanco } from './componentes/login-banco/login'; // <-- ajusta esta ruta a tu carpeta real
import { Principal } from './componentes/app-banco/app';
import { Cuenta } from './componentes/cuenta-banco/cuenta';
import { Mas } from './componentes/mas-banco/mas';
import { Movimientos } from './componentes/monimiento-banco/movimiento';
import { Pago } from './componentes/pagos-banco/pago';
import { Qr } from './componentes/qr-banco/qr';
import { Recarga } from './componentes/recarga-banco/recarga';
import { Scan } from './componentes/scan-banco/scan';
import { Servicios } from './componentes/servicios-banco/servicios';
import { Transferir } from './componentes/transferencia.banco/transferir';
import { Verificacion } from './componentes/veri-banco/veri';
import { DepositoContador } from './componentes/deposito-contador/deposito-contador';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginBanco },
  { path: 'app', component: Principal, canActivate: [authGuard] },
  { path: 'deposito-contador', component: DepositoContador, canActivate: [authGuard] },
  { path: 'cuenta', component: Cuenta, canActivate: [authGuard] },
  { path: 'mas', component: Mas, canActivate: [authGuard] },
  { path: 'movimientos', component: Movimientos, canActivate: [authGuard] },
  { path: 'pago', component: Pago, canActivate: [authGuard] },
  { path: 'qr', component: Qr, canActivate: [authGuard] },
  { path: 'recarga', component: Recarga, canActivate: [authGuard] },
  { path: 'scan', component: Scan, canActivate: [authGuard] },
  { path: 'servicios', component: Servicios, canActivate: [authGuard] },
  { path: 'transferir', component: Transferir, canActivate: [authGuard] },
  { path: 'verificacion', component: Verificacion },
  { path: '**', redirectTo: 'login' },
];