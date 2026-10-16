import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../constant/ApiEndpoints';
import { Goal, CreateGoalRequest, UpdateGoalRequest } from '../model/goal.model';
import { IResponse } from '../model/interface/response.interface';
import { ApiService } from './apiService/api-service';

type GoalFilter = 'ytd' | 'month' | 'quarter' | 'year';

export interface GoalFilterOptions {
  fiscalYearId?: string;
  quarter?: number;
  monthFrom?: number;
  monthTo?: number;
  ytd?: boolean;
}

@Injectable({ providedIn: 'root' })
export class GoalService {
  private readonly api = inject(ApiService);

  getAll(scorecardId?: string, filterOptions?: GoalFilterOptions): Observable<Goal[]> {
    const searchParams = new URLSearchParams();
    if (scorecardId) {
      searchParams.set('scorecardId', scorecardId);
    }
    if (filterOptions) {
      if (filterOptions.fiscalYearId) {
        searchParams.set('fiscalYearId', filterOptions.fiscalYearId);
      }
      if (filterOptions.quarter !== undefined) {
        searchParams.set('quarter', filterOptions.quarter.toString());
      }
      if (filterOptions.monthFrom !== undefined) {
        searchParams.set('monthFrom', filterOptions.monthFrom.toString());
      }
      if (filterOptions.monthTo !== undefined) {
        searchParams.set('monthTo', filterOptions.monthTo.toString());
      }
      if (filterOptions.ytd) {
        searchParams.set('ytd', 'true');
      }
    }
    const query = searchParams.toString();
    const url = query ? `${ApiEndpoint.Goal}?${query}` : ApiEndpoint.Goal;
    return this.api.get<IResponse<Goal[]>>(url).pipe(map((res) => res.data ?? []));
  }

  getByScorecard(scorecardId: string, filterOptions?: GoalFilterOptions): Observable<Goal[]> {
    return this.getAll(scorecardId, filterOptions);
  }

  getById(id: string): Observable<Goal> {
    return this.api.get<IResponse<Goal>>(`${ApiEndpoint.Goal}/${id}`).pipe(map((res) => res.data!));
  }

  create(request: CreateGoalRequest): Observable<Goal> {
    return this.api.post<IResponse<Goal>>(ApiEndpoint.Goal, request).pipe(map((res) => res.data!));
  }

  update(id: string, request: UpdateGoalRequest): Observable<Goal> {
    return this.api.put<IResponse<Goal>>(`${ApiEndpoint.Goal}/${id}`, request).pipe(
      map((res) => res.data!)
    );
  }

  delete(id: string): Observable<boolean> {
    return this.api.delete<IResponse<boolean>>(`${ApiEndpoint.Goal}/${id}`).pipe(
      map((res) => res.data!)
    );
  }
}