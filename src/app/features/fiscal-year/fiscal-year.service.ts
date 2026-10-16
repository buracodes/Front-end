import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';
import { FiscalYear, CreateFiscalYearRequest, UpdateFiscalYearRequest } from './fiscal-year.model';

@Injectable({ providedIn: 'root' })
export class FiscalYearService {
  private readonly api = inject(ApiService);

  getAll(): Observable<FiscalYear[]> {
    return this.api.get<IResponse<FiscalYear[]>>(ApiEndpoint.FiscalYear).pipe(map((r) => r.data ?? []));
  }

  getById(id: string): Observable<FiscalYear> {
    return this.api.get<IResponse<FiscalYear>>(`${ApiEndpoint.FiscalYear}/${id}`).pipe(map((r) => r.data!));
  }

  create(model: CreateFiscalYearRequest): Observable<FiscalYear> {
    return this.api.post<IResponse<FiscalYear>>(ApiEndpoint.FiscalYear, model).pipe(map((r) => r.data!));
  }

  update(id: string, model: UpdateFiscalYearRequest): Observable<FiscalYear> {
    return this.api.put<IResponse<FiscalYear>>(`${ApiEndpoint.FiscalYear}/${id}`, model).pipe(map((r) => r.data!));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<IResponse<void>>(`${ApiEndpoint.FiscalYear}/${id}`).pipe(
      map((r) => { if (!r.success) throw new Error(r.message ?? 'Failed'); })
    );
  }
}
