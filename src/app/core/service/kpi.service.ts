import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../constant/ApiEndpoints';
import {
  KPI,
  CreateKpiRequest,
  UpdateKpiRequest,
  SetKpiTargetsRequest,
  KpiTargetValue,
  KpiTargetsBulk,
  SetKpiTargetsBulkRequest,
  SetKpiTargetsBulkResult,
  EnterKpiActualRequest,
  KpiActualValue,
  SetPeriodLockConfigRequest,
  PeriodLockStatus,
  PeriodLockStatusItem,
} from '../model/goal.model';
import { IResponse } from '../model/interface/response.interface';
import { ApiService } from './apiService/api-service';

// Re-export KpiTargetValue for consumers
export type { KpiTargetValue };

@Injectable({ providedIn: 'root' })
export class KPIService {
  private readonly api = inject(ApiService);

  getAll(scorecardId?: string, kraId?: string): Observable<KPI[]> {
    const params = new URLSearchParams();
    if (scorecardId) params.set('scorecardId', scorecardId);
    if (kraId) params.set('kraId', kraId);
    const qs = params.toString();
    const url = qs ? `${ApiEndpoint.Kpi}?${qs}` : ApiEndpoint.Kpi;
    return this.api.get<IResponse<KPI[]>>(url).pipe(map((res) => res.data ?? []));
  }

  getByScorecard(scorecardId: string): Observable<KPI[]> {
    return this.getAll(scorecardId);
  }

  getByKRA(kraId: string): Observable<KPI[]> {
    return this.getAll(undefined, kraId);
  }

  getById(id: string): Observable<KPI> {
    return this.api.get<IResponse<KPI>>(`${ApiEndpoint.Kpi}/${id}`).pipe(map((res) => res.data!));
  }

  create(request: CreateKpiRequest): Observable<KPI> {
    return this.api.post<IResponse<KPI>>(ApiEndpoint.Kpi, request).pipe(map((res) => res.data!));
  }

  update(id: string, request: UpdateKpiRequest): Observable<KPI> {
    return this.api.put<IResponse<KPI>>(`${ApiEndpoint.Kpi}/${id}`, request).pipe(
      map((res) => res.data!)
    );
  }

  delete(id: string): Observable<boolean> {
    return this.api.delete<IResponse<boolean>>(`${ApiEndpoint.Kpi}/${id}`).pipe(
      map((res) => res.data!)
    );
  }

  // ── Targets ────────────────────────────────────────────────────────────────
  getTargets(kpiId: string, fiscalYearId: string): Observable<KpiTargetValue[]> {
    return this.api
      .get<IResponse<{ targets: KpiTargetValue[] }>>(
        `${ApiEndpoint.KpiTarget}?kpiId=${kpiId}&fiscalYearId=${fiscalYearId}`
      )
      .pipe(map((res) => res.data?.targets ?? []));
  }

  setTargets(request: SetKpiTargetsRequest): Observable<boolean> {
    return this.api
      .post<IResponse<boolean>>(ApiEndpoint.KpiTarget, request)
      .pipe(map((res) => res.data ?? true));
  }

  /**
   * Targets for every KPI in the scope, in one request. `scorecardId` is optional so the
   * Targets page can cover a whole fiscal year; goal and KRA narrowing is applied to the
   * rows that come back.
   */
  getTargetsBulk(fiscalYearId: string, scorecardId?: string): Observable<KpiTargetsBulk> {
    const params = new URLSearchParams({ fiscalYearId });
    if (scorecardId) params.set('scorecardId', scorecardId);
    return this.api
      .get<IResponse<KpiTargetsBulk>>(`${ApiEndpoint.KpiTarget}/bulk?${params.toString()}`)
      .pipe(
        map(
          (res) =>
            res.data ?? { fiscalYearId, scorecardId: scorecardId ?? null, kpis: [] }
        )
      );
  }

  /**
   * Saves the changed rows. The endpoint answers 201 even when only some rows were
   * accepted, so the flag is returned instead of thrown for the caller to report.
   */
  setTargetsBulk(
    request: SetKpiTargetsBulkRequest
  ): Observable<{ success: boolean; message: string; result: SetKpiTargetsBulkResult | null }> {
    return this.api
      .post<IResponse<SetKpiTargetsBulkResult>>(`${ApiEndpoint.KpiTarget}/bulk`, request)
      .pipe(
        map((res) => ({
          success: res.success,
          message: res.message,
          result: res.data ?? null,
        }))
      );
  }

  // ── Actuals ────────────────────────────────────────────────────────────────
  getActuals(kpiId: string, fiscalYearId: string): Observable<KpiActualValue[]> {
    return this.api
      .get<IResponse<{ values: KpiActualValue[] }>>(
        `${ApiEndpoint.KpiActual}?kpiId=${kpiId}&fiscalYearId=${fiscalYearId}`
      )
      .pipe(map((res) => res.data?.values ?? []));
  }

  getActualHistory(kpiId: string, fiscalPeriodId: string): Observable<KpiActualValue[]> {
    return this.api
      .get<IResponse<KpiActualValue[]>>(
        `${ApiEndpoint.KpiActual}/history?kpiId=${kpiId}&fiscalPeriodId=${fiscalPeriodId}`
      )
      .pipe(map((res) => res.data ?? []));
  }

  enterActual(request: EnterKpiActualRequest): Observable<KpiActualValue> {
    return this.api
      .post<IResponse<KpiActualValue>>(ApiEndpoint.KpiActual, request)
      .pipe(map((res) => res.data!));
  }

  // ── Period locks ──────────────────────────────────────────────────────────
  getLockStatus(scorecardId: string, fiscalYearId: string): Observable<PeriodLockStatus> {
    return this.api
      .get<IResponse<PeriodLockStatus>>(
        `${ApiEndpoint.PeriodLock}?scorecardId=${scorecardId}&fiscalYearId=${fiscalYearId}`
      )
      .pipe(map((res) => res.data!));
  }

  setLockConfig(request: SetPeriodLockConfigRequest): Observable<PeriodLockStatusItem> {
    return this.api
      .put<IResponse<PeriodLockStatusItem>>(ApiEndpoint.PeriodLock, request)
      .pipe(map((res) => res.data!));
  }

  // ── Score snapshots / calculations ────────────────────────────────────────
  getScoreSnapshots(scorecardId: string, fiscalYearId: string, periodFilter?: PeriodFilterParams): Observable<ScoreSnapshotDto> {
    const params = new URLSearchParams();
    params.set('scorecardId', scorecardId);
    params.set('fiscalYearId', fiscalYearId);
    
    if (periodFilter) {
      if (periodFilter.periodType) params.set('periodType', periodFilter.periodType);
      if (periodFilter.quarter) params.set('quarter', periodFilter.quarter.toString());
      if (periodFilter.fromMonth) params.set('fromMonth', periodFilter.fromMonth.toString());
      if (periodFilter.toMonth) params.set('toMonth', periodFilter.toMonth.toString());
      if (periodFilter.year) params.set('year', periodFilter.year.toString());
    }
    
    return this.api
      .get<IResponse<ScoreSnapshotDto>>(
        `${ApiEndpoint.ScoreSnapshot}?${params.toString()}`
      )
      .pipe(map((res) => res.data!));
  }

  recalculate(scorecardId: string, fiscalPeriodId: string): Observable<{ message: string }> {
    return this.api
      .post<IResponse<{ message: string }>>(
        `${ApiEndpoint.ScoreSnapshot}/recalculate?scorecardId=${scorecardId}&fiscalPeriodId=${fiscalPeriodId}`,
        {}
      )
      .pipe(map((res) => res.data!));
  }
}

export interface ScoreSnapshotDto {
  scorecardId: string;
  fiscalYearId: string;
  kpiSnapshots?: ScoreSnapshotEntry[];
  kraSnapshots?: ScoreSnapshotEntry[];
  goalSnapshots?: ScoreSnapshotEntry[];
  scorecardSnapshots?: ScoreSnapshotEntry[];
}

export interface ScoreSnapshotEntry {
  entityId: string;
  fiscalPeriodId: string;
  fiscalMonth: number;
  quarter: number;
  granularity: string;
  isPeriodAggregate?: boolean;
  score?: number;
  actualValue?: number;
  targetValue?: number;
  calculatedAt: string;
}

export interface PeriodFilterParams {
  periodType?: 'ytd' | 'quarter' | 'month' | 'year';
  quarter?: number;
  fromMonth?: number;
  toMonth?: number;
  year?: number;
}