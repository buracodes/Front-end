import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import {
  Initiative,
  InitiativeListItem,
  InitiativeRagLabel,
  InitiativeStatus,
  InitiativePriority,
  Milestone,
  MilestoneStatus,
  InitiativeHistoryEntry,
  InitiativeSummary,
  PagedInitiatives,
  InitiativeListQuery,
  CreateInitiativeRequest,
  UpdateInitiativeRequest,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  UpdateMilestoneProgressRequest,
  CloseInitiativeRequest,
} from '../../features/initiative/initiative.model';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';

/** camelCase enum wire values -> the PascalCase unions used throughout the UI. */
const statusToDisplay: Record<string, InitiativeStatus> = {
  notstarted: 'NotStarted',
  inprogress: 'InProgress',
  onhold: 'OnHold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const priorityToDisplay: Record<string, InitiativePriority> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const milestoneStatusToDisplay: Record<string, MilestoneStatus> = {
  notstarted: 'NotStarted',
  inprogress: 'InProgress',
  completed: 'Completed',
};

function normalizeStatus(value?: string): InitiativeStatus {
  const key = (value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return statusToDisplay[key] ?? (value as InitiativeStatus);
}

function normalizeMilestoneStatus(value?: string): MilestoneStatus {
  const key = (value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return milestoneStatusToDisplay[key] ?? (value as MilestoneStatus);
}

function normalizeMilestone(milestone: Milestone): Milestone {
  return { ...milestone, status: normalizeMilestoneStatus(milestone.status) };
}

function normalizePriority(value?: string): InitiativePriority {
  const key = (value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return priorityToDisplay[key] ?? (value as InitiativePriority);
}

function normalizeInitiative(initiative: Initiative): Initiative {
  return {
    ...initiative,
    ownerId: initiative.ownerId ?? '',
    status: normalizeStatus(initiative.status as unknown as string),
    priority: normalizePriority(initiative.priority as unknown as string),
    progressPercentage: initiative.progressPercentage ?? 0,
    progressRagStatus: initiative.progressRagStatus ?? 'NoData',
    isReadyForCompletion: initiative.isReadyForCompletion ?? false,
    notReadyReason: initiative.notReadyReason ?? null,
    totalMilestoneWeight: initiative.totalMilestoneWeight ?? 0,
    milestoneWeightsAreValid: initiative.milestoneWeightsAreValid ?? false,
    actualExpenditure: initiative.actualExpenditure ?? 0,
    budgetPosition: initiative.budgetPosition ?? {
      isBudgetTracked: false,
      plannedBudget: 0,
      actualExpenditure: 0,
      budgetVariance: null,
      budgetUtilizationPercent: null,
      isOverBudget: false,
    },
    milestones: (initiative.milestones ?? []).map(normalizeMilestone),
    dependencies: initiative.dependencies ?? [],
  };
}

export function milestoneStatus(milestone: Milestone): Milestone['status'] {
  return milestone.status;
}

export function isInitiativeOverdue(initiative: InitiativeListItem | Initiative): boolean {
  const listItem = initiative as InitiativeListItem;
  if (typeof listItem.isOverdue === 'boolean') {
    return listItem.isOverdue;
  }

  if (!initiative.endDate) return false;
  const inactive: InitiativeStatus[] = ['Completed', 'Cancelled'];
  if (inactive.includes(initiative.status)) return false;
  return new Date(initiative.endDate).getTime() < Date.now();
}

@Injectable({ providedIn: 'root' })
export class InitiativeService {
  private readonly api = inject(ApiService);

  getAll(query?: InitiativeListQuery): Observable<PagedInitiatives> {
    const parts: string[] = [];
    if (query?.search) parts.push(`search=${encodeURIComponent(query.search)}`);
    if (query?.status) parts.push(`status=${encodeURIComponent(query.status)}`);
    if (query?.priority) parts.push(`priority=${encodeURIComponent(query.priority)}`);
    if (query?.ownerId) parts.push(`ownerId=${encodeURIComponent(query.ownerId)}`);
    if (query?.includeClosed !== undefined)
      parts.push(`includeClosed=${query.includeClosed}`);
    if (query?.page) parts.push(`page=${query.page}`);
    if (query?.pageSize) parts.push(`pageSize=${query.pageSize}`);

    const url = parts.length
      ? `${ApiEndpoint.Initiative}?${parts.join('&')}`
      : ApiEndpoint.Initiative;

    return this.api
      .get<IResponse<PagedInitiatives>>(url)
      .pipe(
        map((response) => ({
          ...response.data!,
          items: response.data!.items.map((item) => ({
            ...item,
            progressRagStatus: (item.progressRagStatus ?? 'NoData') as InitiativeRagLabel,
          })),
        }))
      );
  }
  
  getSummary(): Observable<InitiativeSummary> {
    return this.api
      .get<IResponse<InitiativeSummary>>(`${ApiEndpoint.Initiative}/summary`)
      .pipe(map((response) => response.data!));
  }

  getById(id: string): Observable<Initiative> {
    return this.api
      .get<IResponse<Initiative>>(`${ApiEndpoint.Initiative}/${id}`)
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }
 
  getHistory(id: string, milestoneId?: string): Observable<InitiativeHistoryEntry[]> {
    const url = milestoneId
      ? `${ApiEndpoint.Initiative}/${id}/history?milestoneId=${encodeURIComponent(
          milestoneId
        )}`
      : `${ApiEndpoint.Initiative}/${id}/history`;

    return this.api
      .get<IResponse<InitiativeHistoryEntry[]>>(url)
      .pipe(map((response) => response.data ?? []));
  }

  create(model: CreateInitiativeRequest): Observable<Initiative> {
    return this.api
      .post<IResponse<Initiative>>(ApiEndpoint.Initiative, model)
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  update(id: string, model: UpdateInitiativeRequest): Observable<Initiative> {
    return this.api
      .put<IResponse<Initiative>>(`${ApiEndpoint.Initiative}/${id}`, model)
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  /**
   * FR-404 actual expenditure only. Its own endpoint because the assigned owner may post spend
   * against their own initiative while `initiatives:edit` - and therefore `update()` - stays
   * reserved for Power Users and Admins.
   */
  updateExpenditure(id: string, actualExpenditure: number): Observable<Initiative> {
    return this.api
      .put<IResponse<Initiative>>(`${ApiEndpoint.Initiative}/${id}/expenditure`, { actualExpenditure })
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  delete(id: string): Observable<void> {
    return this.api
      .delete<IResponse<void>>(`${ApiEndpoint.Initiative}/${id}`)
      .pipe(map(() => void 0));
  }

  getMilestones(initiativeId: string): Observable<Milestone[]> {
    return this.api
      .get<IResponse<Milestone[]>>(
        `${ApiEndpoint.Initiative}/${initiativeId}/milestones`
      )
      .pipe(map((response) => (response.data ?? []).map(normalizeMilestone)));
  }

  createMilestone(
    initiativeId: string,
    model: CreateMilestoneRequest
  ): Observable<Milestone> {
    return this.api
      .post<IResponse<Milestone>>(
        `${ApiEndpoint.Initiative}/${initiativeId}/milestones`,
        model
      )
      .pipe(map((response) => normalizeMilestone(response.data!)));
  }

  updateMilestone(
    initiativeId: string,
    milestoneId: string,
    model: UpdateMilestoneRequest
  ): Observable<Milestone> {
    return this.api
      .put<IResponse<Milestone>>(
        `${ApiEndpoint.Initiative}/${initiativeId}/milestones/${milestoneId}`,
        model
      )
      .pipe(map((response) => normalizeMilestone(response.data!)));
  }

  updateMilestoneProgress(
    initiativeId: string,
    milestoneId: string,
    model: UpdateMilestoneProgressRequest
  ): Observable<Initiative> {
    return this.api
      .post<IResponse<Initiative>>(
        `${ApiEndpoint.Initiative}/${initiativeId}/milestones/${milestoneId}/progress`,
        model
      )
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  deleteMilestone(initiativeId: string, milestoneId: string): Observable<void> {
    return this.api
      .delete<IResponse<void>>(
        `${ApiEndpoint.Initiative}/${initiativeId}/milestones/${milestoneId}`
      )
      .pipe(map(() => void 0));
  }

  close(
    initiativeId: string,
    model: CloseInitiativeRequest
  ): Observable<Initiative> {
    return this.api
      .post<IResponse<Initiative>>(
        `${ApiEndpoint.Initiative}/${initiativeId}/close`,
        model
      )
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  
  reopen(initiativeId: string, reason: string): Observable<Initiative> {
    return this.api
      .post<IResponse<Initiative>>(`${ApiEndpoint.Initiative}/${initiativeId}/reopen`, {
        reason,
      })
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  /** FRD lifecycle: puts an initiative on hold with a recorded reason. */
  hold(initiativeId: string, reason: string): Observable<Initiative> {
    return this.api
      .post<IResponse<Initiative>>(`${ApiEndpoint.Initiative}/${initiativeId}/hold`, { reason })
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  /** FRD lifecycle: resumes work on an initiative that was on hold. */
  resume(initiativeId: string): Observable<Initiative> {
    return this.api
      .post<IResponse<Initiative>>(`${ApiEndpoint.Initiative}/${initiativeId}/resume`, {})
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  /** FRD lifecycle: cancels an initiative with a recorded reason. */
  cancel(initiativeId: string, reason: string): Observable<Initiative> {
    return this.api
      .post<IResponse<Initiative>>(`${ApiEndpoint.Initiative}/${initiativeId}/cancel`, { reason })
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  addDependency(
    initiativeId: string,
    dependsOnInitiativeId: string
  ): Observable<Initiative> {
    return this.api
      .post<IResponse<Initiative>>(
        `${ApiEndpoint.Initiative}/${initiativeId}/dependencies`,
        { dependsOnInitiativeId }
      )
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }

  removeDependency(
    initiativeId: string,
    dependsOnInitiativeId: string
  ): Observable<Initiative> {
    return this.api
      .delete<IResponse<Initiative>>(
        `${ApiEndpoint.Initiative}/${initiativeId}/dependencies/${dependsOnInitiativeId}`
      )
      .pipe(map((response) => normalizeInitiative(response.data!)));
  }
}