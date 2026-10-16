import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { ApiService } from '../../core/service/apiService/api-service';
import { environment } from '../../../environments/environment';

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  requiresScorecard: boolean;
  requiresDivision: boolean;
}

export type ReportLevel = 'scorecard' | 'goal' | 'kra' | 'kpi';

export type ReportGranularity = 'month' | 'quarter' | 'year' | 'ytd';

export type ReportExportFormat = 'pdf' | 'xlsx' | 'csv';

export interface ReportFilter {
  reportType: string;
  scorecardId?: string;
  fiscalYearId?: string;
  divisionId?: string;
  level?: ReportLevel;
  granularity?: ReportGranularity;
  fromMonth?: number;
  toMonth?: number;
  quarter?: number;
}

export interface ReportEnvelope {
  reportType: string;
  title: string;
  subtitle?: string;
  generatedAtUtc: string;
  generatedBy: string;
  filters: Record<string, string | null>;
  columns: string[];
  rows: (string | null)[][];
  summary: Record<string, string | null>;
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  getTemplates(): Observable<ReportTemplate[]> {
    return this.api.get<ReportTemplate[]>(`${ApiEndpoint.Reports}/templates`);
  }

  generate(filter: ReportFilter): Observable<ReportEnvelope> {
    return this.api.post<ReportEnvelope>(`${ApiEndpoint.Reports}/generate`, filter);
  }

  export(filter: ReportFilter, format: ReportExportFormat): Observable<Blob> {
    return this.http.post(
      `${environment.API_URL}${ApiEndpoint.Reports}/export?format=${format}`,
      filter,
      { responseType: 'blob' }
    );
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}