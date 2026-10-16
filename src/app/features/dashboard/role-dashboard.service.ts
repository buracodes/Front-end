import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';
import {
  DashboardFilter,
  DashboardRoleContext,
  DashboardWidgetBundle,
  GoalDrilldown,
} from './role-dashboard.model';

/**
 * Single source of truth for the role driven dashboard shell.
 *
 * The backend decides which widgets and quick actions a role receives and applies
 * the data scope (organization wide vs. assigned only) before anything is sent,
 * so the shell only has to render what it is given. Scores are never recalculated
 * here - they arrive from the SPMS calculation engine with an explicit RAG label.
 */
@Injectable({ providedIn: 'root' })
export class RoleDashboardService {
  private readonly api = inject(ApiService);

  getContext(filter: DashboardFilter): Observable<DashboardRoleContext> {
    return this.api
      .get<IResponse<DashboardRoleContext>>(`${ApiEndpoint.Dashboard}/context${query(filter)}`)
      .pipe(map((r) => r.data!));
  }

  getWidgets(filter: DashboardFilter): Observable<DashboardWidgetBundle> {
    return this.api
      .get<IResponse<DashboardWidgetBundle>>(`${ApiEndpoint.Dashboard}/widgets${query(filter)}`)
      .pipe(map((r) => r.data!));
  }

  getGoalDrilldown(goalId: string, filter: DashboardFilter): Observable<GoalDrilldown> {
    return this.api
      .get<IResponse<GoalDrilldown>>(
        `${ApiEndpoint.Dashboard}/goals/${goalId}/kras${query(filter)}`
      )
      .pipe(map((r) => r.data!));
  }
}

function query(filter: DashboardFilter): string {
  const params = new URLSearchParams();

  if (filter.fiscalYearId) {
    params.set('fiscalYearId', filter.fiscalYearId);
  }
  if (filter.scorecardId) {
    params.set('scorecardId', filter.scorecardId);
  }
  if (filter.periodType) {
    params.set('periodType', filter.periodType);
  }
  if (filter.quarter != null) {
    params.set('quarter', String(filter.quarter));
  }
  if (filter.fromMonth != null) {
    params.set('fromMonth', String(filter.fromMonth));
  }
  if (filter.toMonth != null) {
    params.set('toMonth', String(filter.toMonth));
  }

  const value = params.toString();
  return value ? `?${value}` : '';
}
