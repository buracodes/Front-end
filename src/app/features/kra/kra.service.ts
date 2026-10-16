import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { CreateKraRequest, Kra, UpdateKraRequest } from './kra.model';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';

@Injectable({ providedIn: 'root' })
export class KraService {
  private readonly api = inject(ApiService);

  getAll(scorecardId?: string, goalId?: string, fiscalYearId?: string): Observable<Kra[]> {
    const searchParams = new URLSearchParams();
    if (scorecardId) {
      searchParams.set('scorecardId', scorecardId);
    }
    if (goalId) {
      searchParams.set('goalId', goalId);
    }
    if (fiscalYearId) {
      searchParams.set('fiscalYearId', fiscalYearId);
    }

    const query = searchParams.toString();
    const url = query ? `${ApiEndpoint.Kra}?${query}` : ApiEndpoint.Kra;

    return this.api.get<IResponse<Kra[]>>(url).pipe(map((r) => r.data ?? []));
  }

  getById(id: string): Observable<Kra> {
    return this.api.get<IResponse<Kra>>(`${ApiEndpoint.Kra}/${id}`).pipe(map((r) => r.data!));
  }

  create(model: CreateKraRequest): Observable<Kra> {
    return this.api.post<IResponse<Kra>>(ApiEndpoint.Kra, model).pipe(map((r) => r.data!));
  }

  update(id: string, model: UpdateKraRequest): Observable<Kra> {
    return this.api.put<IResponse<Kra>>(`${ApiEndpoint.Kra}/${id}`, model).pipe(map((r) => r.data!));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<IResponse<void>>(`${ApiEndpoint.Kra}/${id}`).pipe(
      map((r) => {
        if (!r.success) throw new Error(r.message ?? 'Failed');
      })
    );
  }
}
