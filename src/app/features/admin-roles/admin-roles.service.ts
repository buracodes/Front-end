import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';
import { Role, RoleDetail } from './admin-roles.model';

@Injectable({ providedIn: 'root' })
export class AdminRoleService {
  private readonly api = inject(ApiService);

  getAll(): Observable<Role[]> {
    return this.api.get<IResponse<Role[]>>(ApiEndpoint.Role).pipe(map((r) => r.data ?? []));
  }

  getById(id: string): Observable<RoleDetail> {
    return this.api.get<IResponse<RoleDetail>>(`${ApiEndpoint.Role}/${id}`).pipe(map((r) => r.data!));
  }
}
