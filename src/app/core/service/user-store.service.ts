import { Injectable, computed, signal } from '@angular/core';
import { AuthUser } from '../model/auth.model';

@Injectable({ providedIn: 'root' })
export class UserStore {
  private readonly userSignal = signal<AuthUser | null>(null);

  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);
  readonly divisionId = computed(() => this.userSignal()?.divisionId ?? null);
  readonly divisionIds = computed(() => {
    const user = this.userSignal();
    if (!user) {
      return [];
    }
    return user.divisionIds?.length ? user.divisionIds : user.divisionId ? [user.divisionId] : [];
  });
  readonly isDivisionAccount = computed(() => this.divisionIds().length > 0);
  readonly roles = computed(() => this.userSignal()?.roles ?? []);
  readonly permissions = computed(() => this.userSignal()?.permissions ?? []);

  setUser(user: AuthUser | null): void {
    this.userSignal.set(user);
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  hasAnyPermission(permissions: string[]): boolean {
    const granted = this.permissions();
    return permissions.some((permission) => granted.includes(permission));
  }
}
