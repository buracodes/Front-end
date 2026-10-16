import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, map, Observable, tap } from 'rxjs';
import { ApiEndpoint } from '../constant/ApiEndpoints';
import { AuthUser, ChangePasswordRequest, LoginRequest, TokenResponse } from '../model/auth.model';
import { IResponse } from '../model/interface/response.interface';
import { ApiService } from './apiService/api-service';
import { TokenStorageService } from './token-storage.service';
import { UserStore } from './user-store.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(TokenStorageService);
  private readonly userStore = inject(UserStore);
  private readonly router = inject(Router);

  private refreshPromise: Promise<boolean> | null = null;

  get accessToken(): string | null {
    return this.storage.accessToken;
  }

  get isAuthenticated(): boolean {
    return !!this.storage.accessToken;
  }

  initialize(): void {
    const user = this.storage.user;
    if (this.storage.accessToken && this.storage.refreshToken && user) {
      this.userStore.setUser(user);
    } else if (this.storage.accessToken || this.storage.refreshToken) {
      this.storage.clear();
    }
  }

  login(credentials: LoginRequest) {
    return this.api
      .post<IResponse<TokenResponse>>(ApiEndpoint.Auth.Login, credentials)
      .pipe(
        map((response) => response.data),
        tap((token) => {
          if (!token) {
            throw new Error('Login response did not contain session data.');
          }
          this.applySession(token);
        })
      );
  }

  refresh(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.storage.refreshToken;
    if (!refreshToken) {
      this.clearSession();
      return Promise.resolve(false);
    }

    this.refreshPromise = firstValueFrom(
      this.api.post<IResponse<TokenResponse>>(ApiEndpoint.Auth.Refresh, { refreshToken })
    )
      .then((response) => {
        const token = response.data;
        if (!token) {
          throw new Error('Refresh response did not contain session data.');
        }
        this.applySession(token);
        return true;
      })
      .catch(() => {
        this.clearSession();
        this.router.navigate(['/login']);
        return false;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  logout(): void {
    const refreshToken = this.storage.refreshToken;
    const accessToken = this.storage.accessToken;

    if (refreshToken && accessToken) {
      this.api
        .post<IResponse<boolean>>(ApiEndpoint.Auth.Logout, { refreshToken })
        .subscribe({ error: () => {} });
    }

    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * Changes the signed-in user's password. The server revokes every refresh token for
   * the account, so the local session is dropped and the user signs in again.
   */
  changePassword(dto: ChangePasswordRequest): Observable<boolean> {
    return this.api.post<IResponse<boolean>>(ApiEndpoint.Auth.ChangePassword, { dto }).pipe(
      map((response) => response.data ?? false),
      tap(() => this.clearSession())
    );
  }

  getCurrentUser(): void {
    this.api.get<IResponse<AuthUser>>(ApiEndpoint.Auth.Me).subscribe({
      next: (response) => {
        if (response.data) {
          this.userStore.setUser(response.data);
          if (this.storage.user) {
            const session = {
              accessToken: this.storage.accessToken!,
              refreshToken: this.storage.refreshToken!,
              user: response.data,
            };
            this.storage.setSession(session.accessToken, session.refreshToken, session.user);
          }
        }
      },
      error: () => {},
    });
  }

  private applySession(token: TokenResponse): void {
    this.storage.setSession(token.accessToken, token.refreshToken, token.user);
    this.userStore.setUser(token.user);
  }

  private clearSession(): void {
    this.storage.clear();
    this.userStore.setUser(null);
  }
}
