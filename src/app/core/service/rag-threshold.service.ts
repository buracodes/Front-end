import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEndpoint } from '../constant/ApiEndpoints';
import { IResponse } from '../model/interface/response.interface';
import { RagThresholdConfiguration, UpdateRagThresholds } from '../model/rag-threshold.model';
import { ApiService } from './apiService/api-service';

/**
 * FR-607: effective RAG thresholds. Reading is open to every authenticated user because every
 * client bands scores with these values; updating is restricted on the API (and in this admin UI)
 * to the `admin:rag.thresholds.manage` permission.
 */
@Injectable({ providedIn: 'root' })
export class RagThresholdsService {
  private readonly api = inject(ApiService);

  get(): Observable<IResponse<RagThresholdConfiguration>> {
    return this.api.get<IResponse<RagThresholdConfiguration>>(ApiEndpoint.RagThresholds);
  }

  update(payload: UpdateRagThresholds): Observable<IResponse<RagThresholdConfiguration>> {
    return this.api.put<IResponse<RagThresholdConfiguration>>(ApiEndpoint.RagThresholds, payload);
  }
}
