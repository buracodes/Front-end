import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';
import {
  AccessEffect,
  AccessGroup,
  AccessRight,
  EmployeeHrInfo,
  GroupMembershipRow,
  GroupRightRow,
  UserRightRow,
} from './admin-access-control.model';

@Injectable({ providedIn: 'root' })
export class AdminAccessControlService {
  private readonly api = inject(ApiService);

  // ── Reads ──────────────────────────────────────────────────────────────

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

  getMemberships(filter: { groupId?: string; userId?: string } = {}): Observable<GroupMembershipRow[]> {
    const params = new URLSearchParams();
    if (filter.groupId) params.set('groupId', filter.groupId);
    if (filter.userId) params.set('userId', filter.userId);
    const query = params.toString();
    return this.api
      .get<IResponse<GroupMembershipRow[]>>(
        `${ApiEndpoint.AccessControl.Memberships}${query ? `?${query}` : ''}`,
      )
      .pipe(map((r) => r.data ?? []));
  }

  getRightsCatalog(): Observable<AccessRight[]> {
    return this.api
      .get<IResponse<AccessRight[]>>(ApiEndpoint.AccessControl.Rights)
      .pipe(map((r) => r.data ?? []));
  }

  /** Active employees straight from HR — the assignable population, before first sign-in. */
  getEmployees(search?: string): Observable<EmployeeHrInfo[]> {
    const params = new URLSearchParams({ take: '1000' });
    if (search) params.set('search', search);
    return this.api
      .get<IResponse<EmployeeHrInfo[]>>(`${ApiEndpoint.AccessControl.Employees}?${params.toString()}`)
      .pipe(map((r) => r.data ?? []));
  }

  getUserRights(userId: string): Observable<UserRightRow[]> {
    return this.api
      .get<IResponse<UserRightRow[]>>(`${ApiEndpoint.AccessControl.Directory}/${userId}/rights`)
      .pipe(map((r) => r.data ?? []));
  }

  // ── Groups ─────────────────────────────────────────────────────────────

  createGroup(name: string, description: string | null): Observable<AccessGroup> {
    return this.api
      .post<IResponse<AccessGroup>>(ApiEndpoint.AccessControl.Groups, { dto: { name, description } })
      .pipe(map((r) => r.data!));
  }

  updateGroup(groupId: string, name: string, description: string | null): Observable<AccessGroup> {
    return this.api
      .put<IResponse<AccessGroup>>(`${ApiEndpoint.AccessControl.Groups}/${groupId}`, {
        dto: { name, description },
      })
      .pipe(map((r) => r.data!));
  }

  /** Delete is a deactivation: members immediately lose rights granted only through the group. */
  deleteGroup(groupId: string): Observable<AccessGroup> {
    return this.api
      .put<IResponse<AccessGroup>>(`${ApiEndpoint.AccessControl.Groups}/${groupId}/status`, {
        dto: { isActive: false },
      })
      .pipe(map((r) => r.data!));
  }

  // ── Group rights ───────────────────────────────────────────────────────

  assignGroupRight(groupId: string, rightId: string): Observable<GroupRightRow> {
    return this.api
      .put<IResponse<GroupRightRow>>(
        `${ApiEndpoint.AccessControl.Groups}/${groupId}/rights/${rightId}`,
        { effect: 'Grant' },
      )
      .pipe(map((r) => r.data!));
  }

  revokeGroupRight(groupId: string, rightId: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(
        `${ApiEndpoint.AccessControl.Groups}/${groupId}/rights/${rightId}`,
      )
      .pipe(map(() => true));
  }

  // ── Group members (UserRole is binary: grant = assign, deny = remove) ──

  assignMembership(groupId: string, userId: string): Observable<GroupMembershipRow> {
    return this.api
      .post<IResponse<GroupMembershipRow>>(`${ApiEndpoint.AccessControl.Groups}/${groupId}/members`, {
        groupId,
        userId,
      })
      .pipe(map((r) => r.data!));
  }

  removeMembership(groupId: string, userId: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(`${ApiEndpoint.AccessControl.Groups}/${groupId}/members/${userId}`)
      .pipe(map(() => true));
  }

  // ── Direct user rights ─────────────────────────────────────────────────

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

  removeUserRight(userId: string, rightId: string): Observable<boolean> {
    return this.api
      .delete<IResponse<boolean>>(
        `${ApiEndpoint.AccessControl.Directory}/${userId}/rights/${rightId}`,
      )
      .pipe(map(() => true));
  }
}
