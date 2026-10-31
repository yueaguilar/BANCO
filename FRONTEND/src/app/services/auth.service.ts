import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable, tap } from 'rxjs';
import { API_URL } from '../api-config';

export interface AuthUser {
  id: number;
  fullname: string | null;
  email: string;
}

export interface AuthSession {
  id: string;
  created_at: string;
  expires_at: string;
  last_activity: string;
  status: string;
  current: boolean;
  device_info: {
    browser?: string;
    platform?: string;
    userAgent?: string;
  };
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: AuthUser;
  bankData?: Record<string, unknown> | null;
  sessions?: AuthSession[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authUrl = `${API_URL}/api/auth`;

  constructor(private readonly http: HttpClient) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('sessionToken');
    }
  }

  login(accountNumber: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.authUrl}/login`,
      { accountNumber, password },
      { withCredentials: true }
    );
  }

  me(): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(`${this.authUrl}/me`, { withCredentials: true });
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await firstValueFrom(this.me());
      return response.success;
    } catch {
      this.clearCachedUser();
      return false;
    }
  }

  refresh(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authUrl}/refresh`, {}, { withCredentials: true });
  }

  logout(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authUrl}/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.clearCachedUser()));
  }

  logoutAll(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authUrl}/logout-all`, {}, { withCredentials: true })
      .pipe(tap(() => this.clearCachedUser()));
  }

  sessions(): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(`${this.authUrl}/sessions`, { withCredentials: true });
  }

  revokeSession(id: string): Observable<AuthResponse> {
    return this.http.delete<AuthResponse>(`${this.authUrl}/sessions/${encodeURIComponent(id)}`, {
      withCredentials: true
    });
  }

  private clearCachedUser(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem('user');
    localStorage.removeItem('bankData');
  }
}