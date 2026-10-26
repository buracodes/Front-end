import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { ApiService } from '../../core/service/apiService/api-service';
import { IResponse } from '../../core/model/interface/response.interface';
import { titleCaseEnumName } from '../../core/model/scorecard.model';
import { PerformanceMonitoring } from './performance-monitoring.model';

export interface PerformanceMonitoringFilters {
  fiscalYearId?: string;
  scorecardId?: string;
  divisionId?: string;
  periodType?: string;
  quarter?: number;
  fromMonth?: number;
  toMonth?: number;
}

@Injectable({ providedIn: 'root' })
export class PerformanceMonitoringService {
  private readonly api = inject(ApiService);

  get(filters?: PerformanceMonitoringFilters): Observable<PerformanceMonitoring> {
    const params = new URLSearchParams();
    if (filters?.fiscalYearId) params.set('fiscalYearId', filters.fiscalYearId);
    if (filters?.scorecardId) params.set('scorecardId', filters.scorecardId);
    if (filters?.divisionId) params.set('divisionId', filters.divisionId);
    if (filters?.periodType) params.set('periodType', filters.periodType);
    if (filters?.quarter !== undefined && filters?.quarter !== null) params.set('quarter', String(filters.quarter));
    if (filters?.fromMonth !== undefined && filters?.fromMonth !== null) params.set('fromMonth', String(filters.fromMonth));
    if (filters?.toMonth !== undefined && filters?.toMonth !== null) params.set('toMonth', String(filters.toMonth));

    const query = params.toString();
    const url = query ? `${ApiEndpoint.PerformanceMonitoring}?${query}` : ApiEndpoint.PerformanceMonitoring;
    return this.api
      .get<IResponse<PerformanceMonitoring>>(url)
      .pipe(map((r) => this.normalize(r.data!)));
  }

  /** The API serializes enums as camelCase ("corporate"); the UI compares TitleCase. */
  private normalize(data: PerformanceMonitoring): PerformanceMonitoring {
    return {
      ...data,
      scope: titleCaseEnumName(String(data.scope)) as PerformanceMonitoring['scope'],
      kpis: data.kpis ?? [],
      divisions: data.divisions ?? [],
    };
  }
}
