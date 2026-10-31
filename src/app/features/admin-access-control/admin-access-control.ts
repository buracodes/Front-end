import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/model/api-error';
import { UserStore } from '../../core/service/user-store.service';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { AdminAccessControlService } from './admin-access-control.service';
import {
  AccessEffect,
  AccessGroup,
  AccessRight,
  EmployeeHrInfo,
  UserRightRow,
} from './admin-access-control.model';

type TabKey = 'groups' | 'group-rights' | 'group-members' | 'user-rights';

type GroupDialog = { mode: 'create' } | { mode: 'edit'; group: AccessGroup } | null;

type RightDecisionDialog = { right: AccessRight; effect: AccessEffect } | null;

interface RightOptionRow extends AccessRight {
  /** Current effect for the selected target, or null when nothing is assigned. */
  effect: AccessEffect | null;
}

interface RightModule {
  module: string;
  rights: RightOptionRow[];
}

interface GroupOptionRow extends AccessGroup {
  member: boolean;
}

@Component({
  selector: 'app-admin-access-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-access-control.html',
  styleUrl: './admin-access-control.scss',
  host: { '(document:click)': 'closeActionMenu()' },
})
export class AdminAccessControlPage {
  private readonly aclService = inject(AdminAccessControlService);
  private readonly notifications = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly userStore = inject(UserStore);

  readonly Permission = {
    page: 'admin:access.view',
    groups: 'admin:access.groups.manage',
    userRights: 'admin:access.user-rights.manage',
  } as const;

  readonly tabs: { key: TabKey; label: string }[] = [
    { key: 'groups', label: 'Groups' },
    { key: 'group-rights', label: 'Group Rights' },
    { key: 'group-members', label: 'Group Members' },
    { key: 'user-rights', label: 'User Rights' },
  ];

  readonly activeTab = signal<TabKey>('groups');
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly canViewPage = computed(() => this.userStore.hasPermission(this.Permission.page));
  readonly canManageGroups = computed(() => this.userStore.hasPermission(this.Permission.groups));
  readonly canManageUserRights = computed(() =>
    this.userStore.hasPermission(this.Permission.userRights),
  );

  readonly groups = signal<AccessGroup[]>([]);
  readonly rights = signal<AccessRight[]>([]);
  readonly employees = signal<EmployeeHrInfo[]>([]);
  readonly employeesLoading = signal(false);
  readonly employeesLoadFailed = signal(false);

  // ── Groups tab ─────────────────────────────────────────────────────────

  readonly groupSearch = signal('');
  readonly openMenuId = signal<string | null>(null);
  readonly groupDialog = signal<GroupDialog>(null);
  readonly groupFormName = signal('');
  readonly groupFormDescription = signal('');
  readonly savingGroup = signal(false);

  readonly filteredGroups = computed(() => {
    const term = this.groupSearch().trim().toLowerCase();
    const rows = [...this.groups()].sort((a, b) => a.name.localeCompare(b.name));
    if (!term) return rows;
    return rows.filter(
      (group) =>
        group.name.toLowerCase().includes(term) ||
        (group.description ?? '').toLowerCase().includes(term),
    );
  });

  // ── Group rights tab ───────────────────────────────────────────────────

  readonly selectedGroupId = signal<string | null>(null);
  readonly selectedGroupRights = signal<Map<string, AccessEffect>>(new Map());
  readonly rightSearch = signal('');

  readonly selectedGroup = computed(
    () => this.groups().find((group) => group.id === this.selectedGroupId()) ?? null,
  );

  readonly groupRightModules = computed<RightModule[]>(() =>
    this.buildRightModules(this.selectedGroupRights(), this.rightSearch()),
  );

  // ── Group members tab ──────────────────────────────────────────────────

  readonly memberSearch = signal('');
  readonly memberEmployeeId = signal<string | null>(null);
  readonly memberRoleIds = signal<Set<string>>(new Set());

  readonly filteredEmployees = computed(() => {
    const term = this.memberSearch().trim().toLowerCase();
    const rows = this.employees();
    if (!term) return rows;
    return rows.filter((employee) => this.employeeHaystack(employee).includes(term));
  });

  readonly memberEmployee = computed(
    () =>
      this.employees().find((employee) => employee.empId === this.memberEmployeeId()) ?? null,
  );

  readonly memberGroupRows = computed<GroupOptionRow[]>(() => {
    const assigned = this.memberRoleIds();
    return [...this.groups()]
      .filter((group) => group.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((group) => ({ ...group, member: assigned.has(group.id) }));
  });

  // ── User rights tab ────────────────────────────────────────────────────

  readonly rightSearchTerm = signal('');
  readonly rightEmployeeId = signal<string | null>(null);
  readonly rightEmployeeSearch = signal('');
  readonly userRights = signal<UserRightRow[]>([]);
  readonly rightDialog = signal<RightDecisionDialog>(null);
  readonly rightReason = signal('');
  readonly savingRight = signal(false);

  readonly rightEmployee = computed(
    () =>
      this.employees().find((employee) => employee.empId === this.rightEmployeeId()) ?? null,
  );

  readonly rightEmployeeOptions = computed(() => {
    const term = this.rightEmployeeSearch().trim().toLowerCase();
    const rows = this.employees();
    if (!term) return rows;
    return rows.filter((employee) => this.employeeHaystack(employee).includes(term));
  });

  private readonly directEffects = computed(() => {
    const map = new Map<string, AccessEffect>();
    for (const row of this.userRights()) {
      map.set(row.permissionId, row.effect === 'Deny' ? 'Deny' : 'Grant');
    }
    return map;
  });

  readonly userRightModules = computed<RightModule[]>(() =>
    this.buildRightModules(this.directEffects(), this.rightSearchTerm()),
  );

  constructor() {
    void this.loadGroups();
    void this.loadRights();
    void this.loadEmployees();
  }

  selectTab(tab: TabKey): void {
    this.activeTab.set(tab);
  }

  // ── Loading ────────────────────────────────────────────────────────────

  private async loadGroups(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const groups = await this.firstValue(this.aclService.getGroups());
      this.groups.set(groups);
      const current = this.selectedGroupId();
      if (current && !groups.some((group) => group.id === current)) {
        this.selectedGroupId.set(null);
        this.selectedGroupRights.set(new Map());
      }
    } catch (error) {
      this.handleLoadError(error);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRights(): Promise<void> {
    try {
      this.rights.set(await this.firstValue(this.aclService.getRightsCatalog()));
    } catch (error) {
      this.handleLoadError(error);
    }
  }

  private async loadEmployees(): Promise<void> {
    this.employeesLoading.set(true);
    this.employeesLoadFailed.set(false);
    try {
      this.employees.set(await this.firstValue(this.aclService.getEmployees()));
    } catch (error) {
      this.employeesLoadFailed.set(true);
      this.handleLoadError(error);
    } finally {
      this.employeesLoading.set(false);
    }
  }

  // ── Groups tab ─────────────────────────────────────────────────────────

  toggleActionMenu(groupId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuId.set(this.openMenuId() === groupId ? null : groupId);
  }

  closeActionMenu(): void {
    this.openMenuId.set(null);
  }

  openCreateGroup(): void {
    this.groupFormName.set('');
    this.groupFormDescription.set('');
    this.groupDialog.set({ mode: 'create' });
  }

  openEditGroup(group: AccessGroup): void {
    this.openMenuId.set(null);
    this.groupFormName.set(group.name);
    this.groupFormDescription.set(group.description ?? '');
    this.groupDialog.set({ mode: 'edit', group });
  }

  closeGroupDialog(): void {
    if (this.savingGroup()) return;
    this.groupDialog.set(null);
  }

  async saveGroup(): Promise<void> {
    const dialog = this.groupDialog();
    if (!dialog || !this.canManageGroups() || this.savingGroup()) return;

    const name = this.groupFormName().trim();
    if (!name) {
      this.notifications.error('Group name is required.');
      return;
    }

    const description = this.groupFormDescription().trim() || null;
    this.savingGroup.set(true);
    try {
      if (dialog.mode === 'create') {
        await this.firstValue(this.aclService.createGroup(name, description));
        this.notifications.success('Group created.');
      } else {
        await this.firstValue(this.aclService.updateGroup(dialog.group.id, name, description));
        this.notifications.success('Group updated.');
      }
      this.groupDialog.set(null);
      await this.loadGroups();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingGroup.set(false);
    }
  }

  async deleteGroup(group: AccessGroup): Promise<void> {
    this.openMenuId.set(null);
    if (!this.canManageGroups()) return;

    const confirmed = await this.confirmDialog.confirm(
      'Delete group',
      `Delete group '${group.name}'? Its members immediately lose every right granted only through this group.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(this.aclService.deleteGroup(group.id));
      this.notifications.success('Group deleted.');
      await this.loadGroups();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  // ── Group rights tab ───────────────────────────────────────────────────

  async selectGroup(group: AccessGroup): Promise<void> {
    this.selectedGroupId.set(group.id);
    this.selectedGroupRights.set(new Map());
    try {
      const rows = await this.firstValue(this.aclService.getGroupRights(group.id));
      if (this.selectedGroupId() !== group.id) return;
      this.selectedGroupRights.set(
        new Map(rows.map((row) => [row.permissionId, row.effect === 'Deny' ? 'Deny' : 'Grant'])),
      );
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  async assignGroupRight(right: AccessRight): Promise<void> {
    const group = this.selectedGroup();
    if (!group || !this.canManageGroups() || this.selectedGroupRights().get(right.id) === 'Grant') {
      return;
    }

    const added = !this.selectedGroupRights().has(right.id);
    try {
      await this.firstValue(this.aclService.assignGroupRight(group.id, right.id));
      this.selectedGroupRights.update((current) => new Map(current).set(right.id, 'Grant'));
      if (added) this.adjustGroupRightCount(group.id, 1);
      this.notifications.success(`Right assigned to ${group.name}.`);
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  async revokeGroupRight(right: AccessRight): Promise<void> {
    const group = this.selectedGroup();
    if (!group || !this.canManageGroups() || !this.selectedGroupRights().has(right.id)) return;

    const confirmed = await this.confirmDialog.confirm(
      'Revoke right',
      `Revoke '${right.name}' from group '${group.name}'?`,
      { confirmText: 'Revoke', variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(this.aclService.revokeGroupRight(group.id, right.id));
      this.selectedGroupRights.update((current) => {
        const next = new Map(current);
        next.delete(right.id);
        return next;
      });
      this.adjustGroupRightCount(group.id, -1);
      this.notifications.success(`Right revoked from ${group.name}.`);
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  // ── Group members tab ──────────────────────────────────────────────────

  async selectMemberEmployee(employee: EmployeeHrInfo): Promise<void> {
    const employeeId = employee.empId;
    if (!employeeId) {
      this.notifications.error('This HR record has no employee id and cannot hold access.');
      return;
    }

    this.memberEmployeeId.set(employeeId);
    this.memberRoleIds.set(new Set());
    try {
      const rows = await this.firstValue(this.aclService.getMemberships({ userId: employeeId }));
      if (this.memberEmployeeId() !== employeeId) return;
      this.memberRoleIds.set(new Set(rows.map((row) => row.roleId)));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  async grantMembership(group: AccessGroup): Promise<void> {
    const employeeId = this.memberEmployeeId();
    if (!employeeId || !this.canManageGroups() || this.memberRoleIds().has(group.id)) return;

    try {
      await this.firstValue(this.aclService.assignMembership(group.id, employeeId));
      this.memberRoleIds.update((current) => new Set(current).add(group.id));
      this.notifications.success(`${this.memberEmployeeName()} added to ${group.name}.`);
      await this.loadGroups();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  async denyMembership(group: AccessGroup): Promise<void> {
    const employeeId = this.memberEmployeeId();
    if (!employeeId || !this.canManageGroups() || !this.memberRoleIds().has(group.id)) return;

    const confirmed = await this.confirmDialog.confirm(
      'Remove membership',
      `Remove ${this.memberEmployeeName()} from group '${group.name}'?`,
      { confirmText: 'Remove', variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(this.aclService.removeMembership(group.id, employeeId));
      this.memberRoleIds.update((current) => {
        const next = new Set(current);
        next.delete(group.id);
        return next;
      });
      this.notifications.success(`Membership to ${group.name} removed.`);
      await this.loadGroups();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  memberEmployeeName(): string {
    const employee = this.memberEmployee();
    return employee ? this.employeeName(employee) : '';
  }

  // ── User rights tab ────────────────────────────────────────────────────

  async selectRightEmployee(employee: EmployeeHrInfo): Promise<void> {
    const employeeId = employee.empId;
    if (!employeeId) {
      this.notifications.error('This HR record has no employee id and cannot hold access.');
      return;
    }

    this.rightEmployeeId.set(employeeId);
    this.userRights.set([]);
    try {
      const rows = await this.firstValue(this.aclService.getUserRights(employeeId));
      if (this.rightEmployeeId() !== employeeId) return;
      this.userRights.set(rows);
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  openRightDecision(right: AccessRight, effect: AccessEffect): void {
    if (!this.rightEmployeeId() || !this.canManageUserRights()) return;
    this.rightReason.set('');
    this.rightDialog.set({ right, effect });
  }

  closeRightDialog(): void {
    if (this.savingRight()) return;
    this.rightDialog.set(null);
  }

  async confirmRightDecision(): Promise<void> {
    const dialog = this.rightDialog();
    const employeeId = this.rightEmployeeId();
    if (!dialog || !employeeId || this.savingRight()) return;

    const reason = this.rightReason().trim();
    if (!reason) {
      this.notifications.error('A justification reason is required for every direct user right.');
      return;
    }

    this.savingRight.set(true);
    try {
      await this.firstValue(
        this.aclService.setUserRight(employeeId, dialog.right.id, dialog.effect, reason),
      );
      this.notifications.success(
        `${dialog.effect === 'Grant' ? 'Granted' : 'Denied'} '${dialog.right.name}'.`,
      );
      this.rightDialog.set(null);
      this.userRights.set(await this.firstValue(this.aclService.getUserRights(employeeId)));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingRight.set(false);
    }
  }

  async revokeUserRight(right: AccessRight): Promise<void> {
    const employeeId = this.rightEmployeeId();
    if (!employeeId || !this.canManageUserRights() || !this.directEffects().has(right.id)) return;

    const confirmed = await this.confirmDialog.confirm(
      'Revoke direct right',
      `Remove the direct assignment of '${right.name}'? Group rights are unaffected.`,
      { confirmText: 'Revoke', variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(this.aclService.removeUserRight(employeeId, right.id));
      this.notifications.success('Direct right removed.');
      this.userRights.set(await this.firstValue(this.aclService.getUserRights(employeeId)));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  rightEffectOf(rightId: string): AccessEffect | null {
    return this.directEffects().get(rightId) ?? null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  employeeName(employee: EmployeeHrInfo): string {
    const parts = [employee.firstName, employee.middleName].filter(
      (part): part is string => !!part && part.trim().length > 0,
    );
    if (parts.length > 0) return parts.join(' ');
    return employee.lastName?.trim() || employee.idCode || employee.email || employee.empId || 'Unknown';
  }

  employeeSubtitle(employee: EmployeeHrInfo): string {
    return [employee.positionName, employee.divisionName, employee.departmentName]
      .filter((part): part is string => !!part && part.trim().length > 0)
      .join(' · ');
  }

  employeeKey(employee: EmployeeHrInfo): string {
    return employee.empId ?? employee.idCode ?? '';
  }

  private employeeHaystack(employee: EmployeeHrInfo): string {
    return [
      employee.firstName,
      employee.middleName,
      employee.lastName,
      employee.idCode,
      employee.email,
      employee.positionName,
      employee.divisionName,
      employee.departmentName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private buildRightModules(
    effects: ReadonlyMap<string, AccessEffect>,
    term: string,
  ): RightModule[] {
    const search = term.trim().toLowerCase();
    const byModule = new Map<string, RightOptionRow[]>();
    for (const right of this.rights()) {
      const haystack = `${right.name} ${right.module} ${right.description ?? ''}`.toLowerCase();
      if (search && !haystack.includes(search)) continue;

      const moduleName = right.module || 'General';
      const rows = byModule.get(moduleName) ?? [];
      rows.push({ ...right, effect: effects.get(right.id) ?? null });
      byModule.set(moduleName, rows);
    }

    return [...byModule.entries()]
      .map(([module, rows]) => ({
        module,
        rights: rows.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.module.localeCompare(b.module));
  }

  private firstValue<T>(observable$: Observable<T>): Promise<T> {
    return firstValueFrom(observable$);
  }

  private adjustGroupRightCount(groupId: string, delta: number): void {
    this.groups.update((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? { ...group, rightCount: Math.max(0, group.rightCount + delta) }
          : group,
      ),
    );
  }

  private handleLoadError(error: unknown): void {
    const message = toApiError(error).message;
    this.loadError.set(message);
    this.notifications.error(message);
  }
}
