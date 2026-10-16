import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';
import { AppUser } from './admin-users.model';

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private readonly api = inject(ApiService);

  getAll(): Observable<AppUser[]> {
    return this.api.get<IResponse<AppUser[]>>(ApiEndpoint.User).pipe(map((r) => r.data ?? []));
  }

  getById(id: string): Observable<AppUser> {
    return this.api.get<IResponse<AppUser>>(`${ApiEndpoint.User}/${id}`).pipe(map((r) => r.data!));
  }
}
