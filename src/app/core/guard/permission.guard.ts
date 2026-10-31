import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserStore } from '../service/user-store.service';

/**
 * Route guard for capability-gated pages. Navigation visibility is driven by
 * `UserStore.hasPermission`; protection happens on the backend (live evaluation — see
 * ADR-011). This guard only decides where to send a user whose claims lack the
 * capability so they never land on a page that would 403 on every read.
 */
export const permissionGuard = (permission: string | readonly string[]): CanActivateFn => () => {
  const userStore = inject(UserStore);
  const router = inject(Router);

  const required = Array.isArray(permission) ? permission : [permission];
  if (required.length === 0 || userStore.hasAnyPermission([...required])) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
