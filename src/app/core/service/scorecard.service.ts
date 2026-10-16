import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../constant/ApiEndpoints';
import {
  Scorecard,
  CreateScorecardRequest,
  UpdateScorecardRequest,
  FiscalYear,
  CloneScorecardResult,
  normalizeScorecard,
} from '../model/scorecard.model';
import { IResponse } from '../model/interface/response.interface';
import { ApiService } from './apiService/api-service';
import { CreateFiscalYearRequest } from '../../features/fiscal-year/fiscal-year.model';

@Injectable({ providedIn: 'root' })
export class ScorecardService {
  private readonly api = inject(ApiService);

  getAll(fiscalYearId?: string): Observable<Scorecard[]> {
    const url = fiscalYearId
      ? `${ApiEndpoint.Scorecard}?fiscalYearId=${fiscalYearId}`
      : ApiEndpoint.Scorecard;
    return this.api
      .get<IResponse<Scorecard[]>>(url)
      .pipe(map((r) => (r.data ?? []).map(normalizeScorecard)));
  }

  getById(id: string): Observable<Scorecard> {
    return this.api.get<IResponse<Scorecard>>(`${ApiEndpoint.Scorecard}/${id}`).pipe(
      map((r) => normalizeScorecard(r.data!))
    );
  }

  create(model: CreateScorecardRequest): Observable<Scorecard> {
    return this.api.post<IResponse<Scorecard>>(ApiEndpoint.Scorecard, model).pipe(
      map((r) => r.data!)
    );
  }

  update(id: string, model: UpdateScorecardRequest): Observable<Scorecard> {
    return this.api.put<IResponse<Scorecard>>(`${ApiEndpoint.Scorecard}/${id}`, model).pipe(
      map((r) => r.data!)
    );
  }

  delete(id: string): Observable<void> {
    return this.api.delete<IResponse<void>>(`${ApiEndpoint.Scorecard}/${id}`).pipe(
      map((r) => {
        if (!r.success) throw new Error(r.message ?? 'Failed');
      })
    );
  }

  close(id: string): Observable<Scorecard> {
    return this.api.post<IResponse<Scorecard>>(`${ApiEndpoint.Scorecard}/${id}/close`, {}).pipe(
      map((r) => r.data!)
    );
  }

  clone(sourceScorecardId: string, targetFiscalYearId: string, newName?: string): Observable<CloneScorecardResult> {
    return this.api
      .post<IResponse<CloneScorecardResult>>(ApiEndpoint.Scorecard + '/clone', {
        sourceScorecardId,
        targetFiscalYearId,
        newName,
      })
      .pipe(map((r) => r.data!));
  }

  getFiscalYears(): Observable<FiscalYear[]> {
    return this.api.get<IResponse<FiscalYear[]>>(ApiEndpoint.FiscalYear).pipe(
      map((r) => r.data ?? [])
    );
  }

  recalculate(scorecardId: string, fiscalPeriodId: string): Observable<{ message: string }> {
    return this.api
      .post<IResponse<{ message: string }>>(
        `${ApiEndpoint.ScoreSnapshot}/recalculate?scorecardId=${scorecardId}&fiscalPeriodId=${fiscalPeriodId}`,
        {}
      )
      .pipe(map((r) => r.data!));
  }
  createFiscalYear(model: CreateFiscalYearRequest): Observable<FiscalYear> {
  return this.api.post<IResponse<FiscalYear>>(ApiEndpoint.FiscalYear, model).pipe(map((r) => r.data!));
}
}