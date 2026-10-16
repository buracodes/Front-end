import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../constant/ApiEndpoints';
import { KRA, CreateKraRequest, UpdateKraRequest } from '../model/goal.model';
import { IResponse } from '../model/interface/response.interface';
import { ApiService } from './apiService/api-service';

@Injectable({ providedIn: 'root' })
export class KRAService {
  private readonly api = inject(ApiService);

  getAll(scorecardId?: string, goalId?: string): Observable<KRA[]> {
    const params = new URLSearchParams();
    if (scorecardId) params.set('scorecardId', scorecardId);
    if (goalId) params.set('goalId', goalId);
    const qs = params.toString();
    const url = qs ? `${ApiEndpoint.Kra}?${qs}` : ApiEndpoint.Kra;
    return this.api.get<IResponse<KRA[]>>(url).pipe(map((res) => res.data ?? []));
  }

  getByGoal(goalId: string): Observable<KRA[]> {
    return this.getAll(undefined, goalId);
  }

  getByScorecard(scorecardId: string): Observable<KRA[]> {
    return this.getAll(scorecardId);
  }

  getById(id: string): Observable<KRA> {
    return this.api.get<IResponse<KRA>>(`${ApiEndpoint.Kra}/${id}`).pipe(map((res) => res.data!));
  }

  create(request: CreateKraRequest): Observable<KRA> {
    return this.api.post<IResponse<KRA>>(ApiEndpoint.Kra, request).pipe(map((res) => res.data!));
  }

  update(id: string, request: UpdateKraRequest): Observable<KRA> {
    return this.api.put<IResponse<KRA>>(`${ApiEndpoint.Kra}/${id}`, request).pipe(
      map((res) => res.data!)
    );
  }

  delete(id: string): Observable<boolean> {
    return this.api.delete<IResponse<boolean>>(`${ApiEndpoint.Kra}/${id}`).pipe(
      map((res) => res.data!)
    );
  }
}