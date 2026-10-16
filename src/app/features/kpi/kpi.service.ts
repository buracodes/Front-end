import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { CreateKpiRequest, Kpi, UpdateKpiRequest } from './kpi.model';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';

export interface KpiFilters {
  scorecardId?: string;
  kraId?: string;
  goalId?: string;
  fiscalYearId?: string;
}

@Injectable({ providedIn: 'root' })
export class KpiService {
  private readonly api = inject(ApiService);

  getAll(filters?: KpiFilters): Observable<Kpi[]> {
    const searchParams = new URLSearchParams();
    if (filters?.scorecardId) {
      searchParams.set('scorecardId', filters.scorecardId);
    }
    if (filters?.kraId) {
      searchParams.set('kraId', filters.kraId);
    }
    if (filters?.goalId) {
      searchParams.set('goalId', filters.goalId);
    }
    if (filters?.fiscalYearId) {
      searchParams.set('fiscalYearId', filters.fiscalYearId);
    }

    const query = searchParams.toString();
    const url = query ? `${ApiEndpoint.Kpi}?${query}` : ApiEndpoint.Kpi;

    return this.api.get<IResponse<Kpi[]>>(url).pipe(map((r) => r.data ?? []));
  }

  getById(id: string): Observable<Kpi> {
    return this.api.get<IResponse<Kpi>>(`${ApiEndpoint.Kpi}/${id}`).pipe(map((r) => r.data!));
  }

  create(model: CreateKpiRequest): Observable<Kpi> {
    return this.api.post<IResponse<Kpi>>(ApiEndpoint.Kpi, model).pipe(map((r) => r.data!));
  }

  update(id: string, model: UpdateKpiRequest): Observable<Kpi> {
    return this.api.put<IResponse<Kpi>>(`${ApiEndpoint.Kpi}/${id}`, model).pipe(map((r) => r.data!));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<IResponse<void>>(`${ApiEndpoint.Kpi}/${id}`).pipe(
      map((r) => {
        if (!r.success) throw new Error(r.message ?? 'Failed');
      })
    );
  }
}
