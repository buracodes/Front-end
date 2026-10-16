import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import {
  Division,
  CreateDivisionRequest,
  DivisionPlanSummary,
  DivisionPlanDto,
  DivisionPlanQuery,
  DivisionGoalDto,
  DivisionKpiDto,
  SetDivisionContributionsRequest,
  CreateDivisionGoalRequest,
  UpdateDivisionGoalRequest,
  CreateDivisionKpiRequest,
  UpdateDivisionKpiRequest,
  DivisionActualValueDto,
  EnterDivisionActualValueRequest,
  ResetDivisionPasswordRequest,
} from './division.model';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';

@Injectable({ providedIn: 'root' })
export class DivisionService {
  private readonly api = inject(ApiService);

  getAll(): Observable<Division[]> {
    return this.api.get<IResponse<Division[]>>(ApiEndpoint.Division).pipe(
      map((r) => r.data ?? [])
    );
  }

  create(model: CreateDivisionRequest): Observable<Division> {
    return this.api.post<IResponse<Division>>(ApiEndpoint.Division, model).pipe(
      map((r) => r.data!)
    );
  }

  getPlans(divisionId: string): Observable<DivisionPlanSummary[]> {
    return this.api
      .get<IResponse<DivisionPlanSummary[]>>(`${ApiEndpoint.Division}/${divisionId}/plans`)
      .pipe(map((r) => r.data ?? []));
  }

  getPlan(divisionId: string, scorecardId: string): Observable<DivisionPlanDto> {
    return this.api
      .get<IResponse<DivisionPlanDto>>(
        `${ApiEndpoint.Division}/${divisionId}/plans/${scorecardId}`
      )
      .pipe(map((r) => r.data!));
  }

  getPlanContextByScorecard(scorecardId: string, query?: DivisionPlanQuery, divisionId?: string): Observable<DivisionPlanDto> {
    const parts: string[] = [];
    if (divisionId) parts.push(`divisionId=${divisionId}`);
    const q = this.toQueryString(query)?.replace(/^\?/, '');
    if (q) parts.push(q);
    const params = parts.length ? `?${parts.join('&')}` : '';
    return this.api
      .get<IResponse<DivisionPlanDto>>(
        `${ApiEndpoint.Division}/plans/by-scorecard/${scorecardId}${params}`
      )
      .pipe(map((r) => r.data!));
  }

  setContributions(model: SetDivisionContributionsRequest): Observable<DivisionPlanDto> {
    return this.api
      .post<IResponse<DivisionPlanDto>>(`${ApiEndpoint.Division}/contributions`, model)
      .pipe(map((r) => r.data!));
  }

  createGoal(model: CreateDivisionGoalRequest): Observable<DivisionGoalDto> {
    return this.api
      .post<IResponse<DivisionGoalDto>>(`${ApiEndpoint.Division}/goals`, model)
      .pipe(map((r) => r.data!));
  }

  updateGoal(goalId: string, model: UpdateDivisionGoalRequest): Observable<DivisionGoalDto> {
    return this.api
      .put<IResponse<DivisionGoalDto>>(`${ApiEndpoint.Division}/goals/${goalId}`, model)
      .pipe(map((r) => r.data!));
  }

  deleteGoal(goalId: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(`${ApiEndpoint.Division}/goals/${goalId}`)
      .pipe(map((r) => r.data ?? false));
  }

  createKpi(model: CreateDivisionKpiRequest): Observable<DivisionKpiDto> {
    return this.api
      .post<IResponse<DivisionKpiDto>>(`${ApiEndpoint.Division}/kpis`, model)
      .pipe(map((r) => r.data!));
  }

  updateKpi(kpiId: string, model: UpdateDivisionKpiRequest): Observable<DivisionKpiDto> {
    return this.api
      .put<IResponse<DivisionKpiDto>>(`${ApiEndpoint.Division}/kpis/${kpiId}`, model)
      .pipe(map((r) => r.data!));
  }

  deleteKpi(kpiId: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(`${ApiEndpoint.Division}/kpis/${kpiId}`)
      .pipe(map((r) => r.data ?? false));
  }

  finalizePlan(divisionId: string, scorecardId: string): Observable<DivisionPlanSummary> {
    return this.api
      .post<IResponse<DivisionPlanSummary>>(
        `${ApiEndpoint.Division}/plans/${divisionId}/${scorecardId}/finalize`,
        {}
      )
      .pipe(map((r) => r.data!));
  }

  getActuals(divisionId: string, fiscalYearId: string): Observable<DivisionActualValueDto[]> {
    return this.api
      .get<IResponse<DivisionActualValueDto[]>>(
        `${ApiEndpoint.Division}/actuals?divisionId=${divisionId}&fiscalYearId=${fiscalYearId}`
      )
      .pipe(map((r) => r.data ?? []));
  }

  enterActual(dto: EnterDivisionActualValueRequest): Observable<DivisionActualValueDto> {
    return this.api
      .post<IResponse<DivisionActualValueDto>>(`${ApiEndpoint.Division}/actuals`, { dto })
      .pipe(map((r) => r.data!));
  }

  resetAccountPassword(model: ResetDivisionPasswordRequest): Observable<boolean> {
    return this.api
      .post<IResponse<boolean>>(ApiEndpoint.ResetDivisionPassword, { dto: model })
      .pipe(map((r) => r.data ?? false));
  }

  private toQueryString(query?: DivisionPlanQuery): string {
    if (!query) return '';
    const parts: string[] = [];
    if (query.periodType) parts.push(`periodType=${query.periodType}`);
    if (query.quarter != null) parts.push(`quarter=${query.quarter}`);
    if (query.fromMonth != null) parts.push(`fromMonth=${query.fromMonth}`);
    if (query.toMonth != null) parts.push(`toMonth=${query.toMonth}`);
    if (query.year != null) parts.push(`year=${query.year}`);
    return parts.length ? `?${parts.join('&')}` : '';
  }
}
