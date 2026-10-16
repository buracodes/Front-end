import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../constant/ApiEndpoints';
import {
  CoreValue,
  OrganizationProfile,
  PestelCategory,
  PestelItem,
  StrategicTheme,
  SwotCategory,
  SwotItem,
  ImpactLevel,
} from '../model/org-profile.model';
import { IResponse } from '../model/interface/response.interface';
import { ApiService } from './apiService/api-service';

@Injectable({ providedIn: 'root' })
export class OrgProfileService {
  private readonly api = inject(ApiService);

  getProfile(): Observable<OrganizationProfile> {
    return this.api.get<IResponse<OrganizationProfile>>(ApiEndpoint.Organization.Profile).pipe(
      map((res) => res.data!)
    );
  }

  updateIdentity(data: { id: string; name: string; description?: string; vision: string; mission: string }): Observable<OrganizationProfile> {
    return this.api.put<IResponse<OrganizationProfile>>(ApiEndpoint.Organization.Identity, data).pipe(
      map((res) => res.data!)
    );
  }

  // Core Values
  createCoreValue(data: { title: string; description?: string }): Observable<CoreValue> {
    return this.api.post<IResponse<CoreValue>>(ApiEndpoint.Organization.CoreValues, data).pipe(
      map((res) => res.data!)
    );
  }

  updateCoreValue(id: string, data: { id: string; title: string; description?: string }): Observable<CoreValue> {
    return this.api.put<IResponse<CoreValue>>(`${ApiEndpoint.Organization.CoreValues}/${id}`, data).pipe(
      map((res) => res.data!)
    );
  }

  deleteCoreValue(id: string): Observable<boolean> {
    return this.api.delete<IResponse<boolean>>(`${ApiEndpoint.Organization.CoreValues}/${id}`).pipe(
      map((res) => res.data!)
    );
  }

  // Strategic Themes
  createStrategicTheme(data: { title: string; code?: string; description?: string; color?: string }): Observable<StrategicTheme> {
    return this.api.post<IResponse<StrategicTheme>>(ApiEndpoint.Organization.StrategicThemes, data).pipe(
      map((res) => res.data!)
    );
  }

  updateStrategicTheme(id: string, data: { id: string; title: string; code?: string; description?: string; color?: string }): Observable<StrategicTheme> {
    return this.api.put<IResponse<StrategicTheme>>(`${ApiEndpoint.Organization.StrategicThemes}/${id}`, data).pipe(
      map((res) => res.data!)
    );
  }

  deleteStrategicTheme(id: string): Observable<boolean> {
    return this.api.delete<IResponse<boolean>>(`${ApiEndpoint.Organization.StrategicThemes}/${id}`).pipe(
      map((res) => res.data!)
    );
  }

  // SWOT
  createSwotItem(data: { category: SwotCategory; title: string; description?: string; impact: ImpactLevel }): Observable<SwotItem> {
    return this.api.post<IResponse<SwotItem>>(ApiEndpoint.Organization.Swot, data).pipe(
      map((res) => res.data!)
    );
  }

  updateSwotItem(id: string, data: { id: string; category: SwotCategory; title: string; description?: string; impact: ImpactLevel }): Observable<SwotItem> {
    return this.api.put<IResponse<SwotItem>>(`${ApiEndpoint.Organization.Swot}/${id}`, data).pipe(
      map((res) => res.data!)
    );
  }

  deleteSwotItem(id: string): Observable<boolean> {
    return this.api.delete<IResponse<boolean>>(`${ApiEndpoint.Organization.Swot}/${id}`).pipe(
      map((res) => res.data!)
    );
  }

  // PESTEL
  createPestelItem(data: { category: PestelCategory; title: string; description?: string; impact: ImpactLevel }): Observable<PestelItem> {
    return this.api.post<IResponse<PestelItem>>(ApiEndpoint.Organization.Pestel, data).pipe(
      map((res) => res.data!)
    );
  }

  updatePestelItem(id: string, data: { id: string; category: PestelCategory; title: string; description?: string; impact: ImpactLevel }): Observable<PestelItem> {
    return this.api.put<IResponse<PestelItem>>(`${ApiEndpoint.Organization.Pestel}/${id}`, data).pipe(
      map((res) => res.data!)
    );
  }

  deletePestelItem(id: string): Observable<boolean> {
    return this.api.delete<IResponse<boolean>>(`${ApiEndpoint.Organization.Pestel}/${id}`).pipe(
      map((res) => res.data!)
    );
  }
}
