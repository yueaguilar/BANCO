import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, finalize, Observable, shareReplay, switchMap, throwError } from 'rxjs';
import { API_URL } from '../api-config';
import { AuthResponse, AuthService } from './auth.service';

let refreshRequest: Observable<AuthResponse> | null = null;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const isApiRequest = request.url.startsWith(`${API_URL}/`);
  const credentialedRequest = request.clone({
    withCredentials: isApiRequest || request.withCredentials
  });
  if (!isApiRequest) return next(credentialedRequest);
  const isPublicAuthEndpoint = request.url === `${API_URL}/api/auth`
    || /^\/api\/auth\/(login|refresh|logout)$/.test(new URL(request.url, API_URL).pathname)
    || request.url.includes('/api/verification/');

  return next(credentialedRequest).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isPublicAuthEndpoint) {
        return throwError(() => error);
      }

      if (!refreshRequest) {
        refreshRequest = authService.refresh().pipe(
          finalize(() => {
            refreshRequest = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false })
        );
      }

      return refreshRequest.pipe(
        switchMap(() => next(credentialedRequest)),
        catchError((refreshError: unknown) => {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('user');
            localStorage.removeItem('bankData');
          }
          void router.navigate(['/login']);
          return throwError(() => refreshError);
        })
      );
    })
  );
};