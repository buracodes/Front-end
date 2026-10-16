import { HttpContextToken, HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../service/auth.service';

const TOKEN_ROUTES = ['/auth/login', '/auth/refresh', '/auth/logout'];
const RETRIED = new HttpContextToken<boolean>(() => false);

function isTokenRoute(url: string): boolean {
  return TOKEN_ROUTES.some((route) => url.includes(route));
}

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const token = authService.accessToken;

  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    switchMap((event) => {
      if (event instanceof HttpErrorResponse && event.status === 401 && !isTokenRoute(req.url) && !req.context.get(RETRIED)) {
        return from(authService.refresh()).pipe(
          switchMap((refreshed) => {
            if (!refreshed) {
              return throwError(() => event);
            }
            const retry = req.clone({
              setHeaders: { Authorization: `Bearer ${authService.accessToken}` },
              context: req.context.set(RETRIED, true),
            });
            return next(retry);
          })
        );
      }
      return [event];
    })
  );
};
