import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';
import {
  AccessDirectoryUser,
  AccessEffect,
  AccessGroup,
  AccessRight,
  AccessSummary,
  AccessUserDetail,
  AuthorizationAuditEntry,
  EffectiveAccessResult,
  GroupMembershipRow,
  GroupRightRow,
  UserRightRow,
} from './admin-access-control.model';

@Injectable({ providedIn: 'root' })
export class AdminAccessControlService {
  private readonly api = inject(ApiService);

  // ── Reads ──────────────────────────────────────────────────────────────

  loadSummary(): Observable<AccessSummary> {
    return this.api
      .get<IResponse<AccessSummary>>(ApiEndpoint.AccessControl.Summary)
      .pipe(map((r) => r.data!));
  }

  getGroups(): Observable<AccessGroup[]> {
    return this.api
      .get<IResponse<AccessGroup[]>>(ApiEndpoint.AccessControl.Groups)
      .pipe(map((r) => r.data ?? []));
  }

  getGroupRights(groupId: string): Observable<GroupRightRow[]> {
    return this.api
      .get<IResponse<GroupRightRow[]>>(`${ApiEndpoint.AccessControl.GroupRights}/${groupId}/rights`)
      .pipe(map((r) => r.data ?? []));
  }

  getMemberships(groupId?: string): Observable<GroupMembershipRow[]> {
    const query = groupId ? `?groupId=${groupId}` : '';
    return this.api
      .get<IResponse<GroupMembershipRow[]>>(`${ApiEndpoint.AccessControl.Memberships}${query}`)
      .pipe(map((r) => r.data ?? []));
  }

  getRightsCatalog(): Observable<AccessRight[]> {
    return this.api
      .get<IResponse<AccessRight[]>>(ApiEndpoint.AccessControl.Rights)
      .pipe(map((r) => r.data ?? []));
  }

  getDirectory(): Observable<AccessDirectoryUser[]> {
    return this.api
      .get<IResponse<AccessDirectoryUser[]>>(ApiEndpoint.AccessControl.Directory)
      .pipe(map((r) => r.data ?? []));
  }

  getUserDetail(userId: string): Observable<AccessUserDetail> {
    return this.api
      .get<IResponse<AccessUserDetail>>(`${ApiEndpoint.AccessControl.Directory}/${userId}`)
      .pipe(map((r) => r.data!));
  }

  getUserRights(userId: string): Observable<UserRightRow[]> {
    return this.api
      .get<IResponse<UserRightRow[]>>(`${ApiEndpoint.AccessControl.Directory}/${userId}/rights`)
      .pipe(map((r) => r.data ?? []));
  }

  getEffectiveAccess(userId: string): Observable<EffectiveAccessResult> {
    return this.api
      .get<IResponse<EffectiveAccessResult>>(
        `${ApiEndpoint.AccessControl.Directory}/${userId}/effective-access`,
      )
      .pipe(map((r) => r.data!));
  }

  getAuthorizationAudit(): Observable<AuthorizationAuditEntry[]> {
    return this.api
      .get<IResponse<AuthorizationAuditEntry[]>>(ApiEndpoint.AccessControl.Audit)
      .pipe(map((r) => r.data ?? []));
  }

  // ── Groups capability ──────────────────────────────────────────────────

  createGroup(name: string, description: string | null): Observable<AccessGroup> {
    return this.api
      .post<IResponse<AccessGroup>>(ApiEndpoint.AccessControl.Groups, { dto: { name, description } })
      .pipe(map((r) => r.data!));
  }

  updateGroup(groupId: string, description: string | null): Observable<AccessGroup> {
    return this.api
      .put<IResponse<AccessGroup>>(`${ApiEndpoint.AccessControl.Groups}/${groupId}`, {
        dto: { description },
      })
      .pipe(map((r) => r.data!));
  }

  setGroupStatus(groupId: string, isActive: boolean): Observable<AccessGroup> {
    return this.api
      .put<IResponse<AccessGroup>>(`${ApiEndpoint.AccessControl.Groups}/${groupId}/status`, {
        dto: { isActive },
      })
      .pipe(map((r) => r.data!));
  }

  assignMembership(groupId: string, userId: string): Observable<GroupMembershipRow> {
    return this.api
      .post<IResponse<GroupMembershipRow>>(`${ApiEndpoint.AccessControl.Groups}/${groupId}/members`, {
        groupId,
        userId,
      })
      .pipe(map((r) => r.data!));
  }

  removeMembership(groupId: string, userId: string, reason?: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(`${ApiEndpoint.AccessControl.Groups}/${groupId}/members/${userId}`)
      .pipe(map(() => true));
  }

  setGroupRight(groupId: string, rightId: string, effect: AccessEffect): Observable<GroupRightRow> {
    return this.api
      .put<IResponse<GroupRightRow>>(
        `${ApiEndpoint.AccessControl.Groups}/${groupId}/rights/${rightId}`,
        { effect },
      )
      .pipe(map((r) => r.data!));
  }

  removeGroupRight(groupId: string, rightId: string, reason?: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(
        `${ApiEndpoint.AccessControl.Groups}/${groupId}/rights/${rightId}`,
      )
      .pipe(map(() => true));
  }

  // ── Rights catalog capability ──────────────────────────────────────────

  createRight(name: string, module: string, description: string | null): Observable<AccessRight> {
    return this.api
      .post<IResponse<AccessRight>>(ApiEndpoint.AccessControl.Rights, {
        dto: { name, module, description },
      })
      .pipe(map((r) => r.data!));
  }

  updateRight(rightId: string, module: string, description: string | null): Observable<AccessRight> {
    return this.api
      .put<IResponse<AccessRight>>(`${ApiEndpoint.AccessControl.Rights}/${rightId}`, {
        dto: { module, description },
      })
      .pipe(map((r) => r.data!));
  }

  deleteRight(rightId: string, reason?: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(`${ApiEndpoint.AccessControl.Rights}/${rightId}`)
      .pipe(map(() => true));
  }

  // ── User rights capability ─────────────────────────────────────────────

  setUserRight(
    userId: string,
    rightId: string,
    effect: AccessEffect,
    reason: string,
  ): Observable<UserRightRow> {
    return this.api
      .put<IResponse<UserRightRow>>(
        `${ApiEndpoint.AccessControl.Directory}/${userId}/rights/${rightId}`,
        { effect, reason },
      )
      .pipe(map((r) => r.data!));
  }

  removeUserRight(userId: string, rightId: string, reason?: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(
        `${ApiEndpoint.AccessControl.Directory}/${userId}/rights/${rightId}`,
      )
      .pipe(map(() => true));
  }
}
