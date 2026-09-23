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

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginBanco },
  { path: 'app', component: Principal },
  { path: 'cuenta', component: Cuenta },
  { path: 'mas', component: Mas },
  { path: 'movimientos', component: Movimientos },
  { path: 'pago', component: Pago },
  { path: 'qr', component: Qr },
  { path: 'recarga', component: Recarga },
  { path: 'scan', component: Scan },
  { path: 'servicios', component: Servicios },
  { path: 'transferir', component: Transferir },
  { path: 'verificacion', component: Verificacion },
  { path: '**', redirectTo: 'login' },
];