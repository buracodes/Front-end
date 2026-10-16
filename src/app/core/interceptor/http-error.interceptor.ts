import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiError, toApiError } from '../model/api-error';
import { NotificationService } from '../service/notification.service';

export const httpErrorInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      const apiError: ApiError = toApiError(error);

      if (apiError.status === 0 || apiError.status >= 500) {
        notifications.error(apiError.message);
      }

      return throwError(() => apiError);
    })
  );
};
