import { HttpContextToken, HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
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

  // HttpClient reports failures on the error channel, so the 401 handling must live in
  // catchError — a switchMap over next() never observes an HttpErrorResponse.
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isTokenRoute(req.url) && !req.context.get(RETRIED)) {
        return from(authService.refresh()).pipe(
          switchMap((refreshed) => {
            if (!refreshed) {
              return throwError(() => error);
            }
            const retry = req.clone({
              setHeaders: { Authorization: `Bearer ${authService.accessToken}` },
              context: req.context.set(RETRIED, true),
            });
            return next(retry);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
