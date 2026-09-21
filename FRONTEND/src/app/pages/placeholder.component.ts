import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="min-height:100vh;display:grid;place-items:center;background:#f4f7fb;font-family:Arial,sans-serif;">
      <div style="background:#fff;padding:32px 42px;border-radius:24px;box-shadow:0 10px 25px rgba(22,33,51,0.08);text-align:center;max-width:520px;">
        <h2 style="margin:0 0 12px;">Sección en mantenimiento</h2>
        <p style="margin:0 0 18px;color:#4d6079;">Esta vista corresponde al flujo original del banco y se puede completar con el mismo HTML/JS de la carpeta pública.</p>
        <a routerLink="/app" style="display:inline-block;background:#0b5bd3;color:#fff;padding:10px 16px;border-radius:12px;text-decoration:none;">Volver al inicio</a>
      </div>
    </div>
  `,
})
export class PlaceholderComponent {}
