import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { Scorecard, CreateScorecardRequest, UpdateScorecardRequest, normalizeScorecard } from './scorecard.model';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';
import { ScoreSnapshotDto } from '../../core/service/kpi.service';
import { FiscalYear, CloneScorecardResult } from '../../core/model/scorecard.model';

@Injectable({ providedIn: 'root' })
export class ScorecardService {
  private readonly api = inject(ApiService);

  getAll(fiscalYearId?: string): Observable<Scorecard[]> {
    const url = fiscalYearId
      ? `${ApiEndpoint.Scorecard}?fiscalYearId=${fiscalYearId}`
      : ApiEndpoint.Scorecard;
    return this.api.get<IResponse<Scorecard[]>>(url).pipe(map((r) => (r.data ?? []).map(normalizeScorecard)));
  }

  getById(id: string): Observable<Scorecard> {
    return this.api.get<IResponse<Scorecard>>(`${ApiEndpoint.Scorecard}/${id}`).pipe(map((r) => normalizeScorecard(r.data!)));
  }

  getFiscalYears(): Observable<FiscalYear[]> {
    return this.api.get<IResponse<FiscalYear[]>>(ApiEndpoint.FiscalYear).pipe(map((r) => r.data ?? []));
  }

  getScoreSnapshots(scorecardId: string, fiscalYearId: string): Observable<ScoreSnapshotDto | null> {
    return this.api.get<IResponse<ScoreSnapshotDto>>(
      `${ApiEndpoint.ScoreSnapshot}?scorecardId=${scorecardId}&fiscalYearId=${fiscalYearId}`
    ).pipe(map((r) => r.data ?? null));
  }

  create(model: CreateScorecardRequest): Observable<Scorecard> {
    return this.api.post<IResponse<Scorecard>>(ApiEndpoint.Scorecard, model).pipe(map((r) => r.data!));
  }

  update(id: string, model: UpdateScorecardRequest): Observable<Scorecard> {
    return this.api.put<IResponse<Scorecard>>(`${ApiEndpoint.Scorecard}/${id}`, model).pipe(map((r) => r.data!));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<IResponse<void>>(`${ApiEndpoint.Scorecard}/${id}`).pipe(
      map((r) => { if (!r.success) throw new Error(r.message ?? 'Failed'); })
    );
  }

  close(id: string): Observable<Scorecard> {
    return this.api.post<IResponse<Scorecard>>(`${ApiEndpoint.Scorecard}/${id}/close`, {}).pipe(map((r) => r.data!));
  }

  recalculate(scorecardId: string, fiscalPeriodId: string): Observable<{ message: string }> {
    return this.api
      .post<IResponse<{ message: string }>>(
        `${ApiEndpoint.ScoreSnapshot}/recalculate?scorecardId=${scorecardId}&fiscalPeriodId=${fiscalPeriodId}`,
        {}
      )
      .pipe(map((r) => r.data!));
  }
}
