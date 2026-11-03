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

/** Grant mode lists what is not assigned yet; revoke mode lists what is. */
type AssignmentMode = 'grant' | 'revoke';

type GroupDialog = { mode: 'create' } | { mode: 'edit'; group: AccessGroup } | null;

type RightDecisionDialog = { rights: AccessRight[] } | null;

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

  readonly groupSearchTerm = signal('');
  readonly selectedGroupId = signal<string | null>(null);
  readonly selectedGroupRights = signal<Map<string, AccessEffect>>(new Map());
  readonly rightSearch = signal('');
  readonly groupRightsMode = signal<AssignmentMode>('grant');
  readonly groupRightSelection = signal<Set<string>>(new Set());
  readonly loadingGroupRights = signal(false);
  readonly savingGroupRights = signal(false);

  readonly selectedGroup = computed(
    () => this.groups().find((group) => group.id === this.selectedGroupId()) ?? null,
  );

  readonly groupOptions = computed(() => {
    const term = this.groupSearchTerm().trim().toLowerCase();
    const rows = this.activeGroups();
    if (!term) return rows;
    return rows.filter(
      (group) =>
        group.name.toLowerCase().includes(term) ||
        (group.description ?? '').toLowerCase().includes(term),
    );
  });

  readonly groupRightModules = computed<RightModule[]>(() =>
    this.buildRightModules(
      this.selectedGroupRights(),
      this.rightSearch(),
      this.groupRightsMode() === 'grant' ? 'unassigned' : 'assigned',
    ),
  );

  readonly visibleGroupRights = computed<RightOptionRow[]>(() =>
    this.groupRightModules().flatMap((module) => module.rights),
  );

  readonly selectedGroupRightRows = computed(() => {
    const selected = this.groupRightSelection();
    return this.rights().filter((right) => selected.has(right.id));
  });

  readonly groupRightSelectedCount = computed(() => this.groupRightSelection().size);

  readonly allVisibleGroupRightsSelected = computed(() => {
    const rows = this.visibleGroupRights();
    return rows.length > 0 && rows.every((right) => this.groupRightSelection().has(right.id));
  });

  readonly someVisibleGroupRightsSelected = computed(
    () =>
      !this.allVisibleGroupRightsSelected() &&
      this.visibleGroupRights().some((right) => this.groupRightSelection().has(right.id)),
  );

  readonly groupRightActionLabel = computed(() => {
    const isGrant = this.groupRightsMode() === 'grant';
    const verb = isGrant ? 'Grant' : 'Revoke';
    if (this.savingGroupRights()) return isGrant ? 'Granting…' : 'Revoking…';
    const count = this.groupRightSelectedCount();
    return count > 0 ? `${verb} selected (${count})` : `${verb} selected`;
  });

  // ── Group members tab ──────────────────────────────────────────────────

  readonly memberSearch = signal('');
  readonly memberEmployeeId = signal<string | null>(null);
  readonly memberRoleIds = signal<Set<string>>(new Set());
  readonly memberMode = signal<AssignmentMode>('grant');
  readonly memberGroupSelection = signal<Set<string>>(new Set());
  readonly loadingMembers = signal(false);
  readonly savingMembers = signal(false);

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

  readonly activeGroups = computed(() =>
    this.groups()
      .filter((group) => group.isActive)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly memberGroupRows = computed<GroupOptionRow[]>(() => {
    const assigned = this.memberRoleIds();
    return this.activeGroups().map((group) => ({ ...group, member: assigned.has(group.id) }));
  });

  readonly memberGrantGroups = computed(() =>
    this.memberGroupRows().filter((group) => !group.member),
  );

  readonly memberRevokeGroups = computed(() =>
    this.memberGroupRows().filter((group) => group.member),
  );

  readonly memberModeGroups = computed(() =>
    this.memberMode() === 'grant' ? this.memberGrantGroups() : this.memberRevokeGroups(),
  );

  readonly memberGroupSelectedCount = computed(() => this.memberGroupSelection().size);

  readonly allModeGroupsSelected = computed(() => {
    const rows = this.memberModeGroups();
    return rows.length > 0 && rows.every((group) => this.memberGroupSelection().has(group.id));
  });

  readonly someModeGroupsSelected = computed(
    () =>
      !this.allModeGroupsSelected() &&
      this.memberModeGroups().some((group) => this.memberGroupSelection().has(group.id)),
  );

  readonly memberActionLabel = computed(() => {
    const isGrant = this.memberMode() === 'grant';
    const verb = isGrant ? 'Grant' : 'Revoke';
    if (this.savingMembers()) return isGrant ? 'Granting…' : 'Revoking…';
    const count = this.memberGroupSelectedCount();
    return count > 0 ? `${verb} selected (${count})` : `${verb} selected`;
  });

  // ── User rights tab ────────────────────────────────────────────────────

  readonly rightSearchTerm = signal('');
  readonly rightEmployeeId = signal<string | null>(null);
  readonly rightEmployeeSearch = signal('');
  readonly userRights = signal<UserRightRow[]>([]);
  readonly userRightsMode = signal<AssignmentMode>('grant');
  readonly rightSelection = signal<Set<string>>(new Set());
  readonly loadingUserRights = signal(false);
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
    this.buildRightModules(
      this.directEffects(),
      this.rightSearchTerm(),
      this.userRightsMode() === 'grant' ? 'unassigned' : 'assigned',
    ),
  );

  readonly visibleRights = computed<RightOptionRow[]>(() =>
    this.userRightModules().flatMap((module) => module.rights),
  );

  readonly selectedRightCount = computed(() => this.rightSelection().size);

  readonly selectedRights = computed(() => {
    const selected = this.rightSelection();
    return this.rights().filter((right) => selected.has(right.id));
  });

  readonly allVisibleRightsSelected = computed(() => {
    const rows = this.visibleRights();
    return rows.length > 0 && rows.every((right) => this.rightSelection().has(right.id));
  });

  readonly someVisibleRightsSelected = computed(
    () =>
      !this.allVisibleRightsSelected() &&
      this.visibleRights().some((right) => this.rightSelection().has(right.id)),
  );

  readonly userRightActionLabel = computed(() => {
    const isGrant = this.userRightsMode() === 'grant';
    const verb = isGrant ? 'Grant' : 'Revoke';
    if (this.savingRight()) return isGrant ? 'Granting…' : 'Revoking…';
    const count = this.selectedRightCount();
    return count > 0 ? `${verb} selected (${count})` : `${verb} selected`;
  });

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
    this.groupRightSelection.set(new Set());
    this.groupRightsMode.set('grant');
    this.loadingGroupRights.set(true);
    try {
      const rows = await this.firstValue(this.aclService.getGroupRights(group.id));
      if (this.selectedGroupId() !== group.id) return;
      this.selectedGroupRights.set(
        new Map(rows.map((row) => [row.permissionId, row.effect === 'Deny' ? 'Deny' : 'Grant'])),
      );
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      if (this.selectedGroupId() === group.id) this.loadingGroupRights.set(false);
    }
  }

  setGroupRightsMode(mode: AssignmentMode): void {
    if (this.groupRightsMode() === mode) return;
    this.groupRightsMode.set(mode);
    this.groupRightSelection.set(new Set());
  }

  isGroupRightSelected(right: AccessRight): boolean {
    return this.groupRightSelection().has(right.id);
  }

  toggleGroupRightSelection(right: AccessRight, selected: boolean): void {
    this.groupRightSelection.update((current) => {
      const next = new Set(current);
      if (selected) next.add(right.id);
      else next.delete(right.id);
      return next;
    });
  }

  toggleSelectAllGroupRights(selected: boolean): void {
    this.groupRightSelection.update((current) => {
      const next = new Set(current);
      for (const right of this.visibleGroupRights()) {
        if (selected) next.add(right.id);
        else next.delete(right.id);
      }
      return next;
    });
  }

  clearGroupRightSelection(): void {
    this.groupRightSelection.set(new Set());
  }

  async grantSelectedGroupRights(): Promise<void> {
    const group = this.selectedGroup();
    const rights = this.selectedGroupRightRows().filter(
      (right) => !this.selectedGroupRights().has(right.id),
    );
    if (!group || !this.canManageGroups() || this.savingGroupRights() || rights.length === 0) {
      return;
    }

    this.savingGroupRights.set(true);
    let granted = 0;
    const failedIds = new Set<string>();

    try {
      for (const right of rights) {
        try {
          await this.firstValue(this.aclService.assignGroupRight(group.id, right.id));
          this.selectedGroupRights.update((current) =>
            new Map(current).set(right.id, 'Grant'),
          );
          granted += 1;
        } catch {
          failedIds.add(right.id);
        }
      }

      this.groupRightSelection.set(failedIds);

      if (granted > 0) {
        this.notifications.success(
          `Granted ${granted} right${granted === 1 ? '' : 's'} to ${group.name}.`,
        );
      }
      if (failedIds.size > 0) {
        this.notifications.error(
          `${failedIds.size} right${failedIds.size === 1 ? '' : 's'} could not be granted.`,
        );
      }

      await this.loadGroups();
      await this.refreshSelectedGroupRights();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingGroupRights.set(false);
    }
  }

  async revokeSelectedGroupRights(): Promise<void> {
    const group = this.selectedGroup();
    const rights = this.selectedGroupRightRows().filter((right) =>
      this.selectedGroupRights().has(right.id),
    );
    if (!group || !this.canManageGroups() || this.savingGroupRights() || rights.length === 0) {
      return;
    }

    const confirmed = await this.confirmDialog.confirm(
      'Revoke rights',
      `Revoke ${rights.length} selected right${rights.length === 1 ? '' : 's'} from group '${group.name}'?`,
      { confirmText: 'Revoke', variant: 'danger' },
    );
    if (!confirmed) return;

    this.savingGroupRights.set(true);
    let revoked = 0;
    const failedIds = new Set<string>();

    try {
      for (const right of rights) {
        try {
          await this.firstValue(this.aclService.revokeGroupRight(group.id, right.id));
          this.selectedGroupRights.update((current) => {
            const next = new Map(current);
            next.delete(right.id);
            return next;
          });
          revoked += 1;
        } catch {
          failedIds.add(right.id);
        }
      }

      this.groupRightSelection.set(failedIds);

      if (revoked > 0) {
        this.notifications.success(
          `Revoked ${revoked} right${revoked === 1 ? '' : 's'} from ${group.name}.`,
        );
      }
      if (failedIds.size > 0) {
        this.notifications.error(
          `${failedIds.size} right${failedIds.size === 1 ? '' : 's'} could not be revoked.`,
        );
      }

      await this.loadGroups();
      await this.refreshSelectedGroupRights();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingGroupRights.set(false);
    }
  }

  async applySelectedGroupRights(): Promise<void> {
    if (this.groupRightsMode() === 'grant') await this.grantSelectedGroupRights();
    else await this.revokeSelectedGroupRights();
  }

  private async refreshSelectedGroupRights(): Promise<void> {
    const groupId = this.selectedGroupId();
    if (!groupId) return;
    try {
      const rows = await this.firstValue(this.aclService.getGroupRights(groupId));
      if (this.selectedGroupId() === groupId) {
        this.selectedGroupRights.set(
          new Map(rows.map((row) => [row.permissionId, row.effect === 'Deny' ? 'Deny' : 'Grant'])),
        );
      }
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
    this.memberGroupSelection.set(new Set());
    this.memberMode.set('grant');
    this.loadingMembers.set(true);
    try {
      const rows = await this.firstValue(this.aclService.getMemberships({ userId: employeeId }));
      if (this.memberEmployeeId() !== employeeId) return;
      this.memberRoleIds.set(new Set(rows.map((row) => row.roleId)));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      if (this.memberEmployeeId() === employeeId) this.loadingMembers.set(false);
    }
  }

  setMemberMode(mode: AssignmentMode): void {
    if (this.memberMode() === mode) return;
    this.memberMode.set(mode);
    this.memberGroupSelection.set(new Set());
  }

  memberEmployeeName(): string {
    const employee = this.memberEmployee();
    return employee ? this.employeeName(employee) : '';
  }

  isMemberGroupSelected(group: GroupOptionRow): boolean {
    return this.memberGroupSelection().has(group.id);
  }

  toggleMemberGroupSelection(group: GroupOptionRow, selected: boolean): void {
    if (!this.memberModeGroups().some((row) => row.id === group.id)) return;
    this.memberGroupSelection.update((current) => {
      const next = new Set(current);
      if (selected) next.add(group.id);
      else next.delete(group.id);
      return next;
    });
  }

  toggleSelectAllMemberGroups(selected: boolean): void {
    this.memberGroupSelection.update((current) => {
      const next = new Set(current);
      for (const group of this.memberModeGroups()) {
        if (selected) next.add(group.id);
        else next.delete(group.id);
      }
      return next;
    });
  }

  clearMemberGroupSelection(): void {
    this.memberGroupSelection.set(new Set());
  }

  async grantSelectedGroups(): Promise<void> {
    const employeeId = this.memberEmployeeId();
    const employeeName = this.memberEmployeeName();
    const groups = this.memberGrantGroups().filter((group) =>
      this.memberGroupSelection().has(group.id),
    );
    if (!employeeId || !this.canManageGroups() || this.savingMembers() || groups.length === 0) {
      return;
    }

    const confirmed = await this.confirmDialog.confirm(
      'Grant group access',
      `Add ${employeeName} to ${groups.length} selected group${groups.length === 1 ? '' : 's'}?`,
      { confirmText: 'Grant', variant: 'info' },
    );
    if (!confirmed) return;

    this.savingMembers.set(true);
    let granted = 0;
    const failedIds = new Set<string>();

    try {
      for (const group of groups) {
        try {
          await this.firstValue(this.aclService.assignMembership(group.id, employeeId));
          this.memberRoleIds.update((current) => new Set(current).add(group.id));
          granted += 1;
        } catch {
          failedIds.add(group.id);
        }
      }

      this.memberGroupSelection.set(failedIds);

      if (granted > 0) {
        this.notifications.success(
          `${employeeName} added to ${granted} group${granted === 1 ? '' : 's'}.`,
        );
      }
      if (failedIds.size > 0) {
        this.notifications.error(
          `${failedIds.size} group${failedIds.size === 1 ? '' : 's'} could not be granted. The employee may be inactive in HR, or the change is not allowed for your own account.`,
        );
      }

      await this.loadGroups();
      await this.refreshMemberMemberships();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingMembers.set(false);
    }
  }

  async revokeSelectedGroups(): Promise<void> {
    const employeeId = this.memberEmployeeId();
    const employeeName = this.memberEmployeeName();
    const groups = this.memberRevokeGroups().filter((group) =>
      this.memberGroupSelection().has(group.id),
    );
    if (!employeeId || !this.canManageGroups() || this.savingMembers() || groups.length === 0) {
      return;
    }

    const confirmed = await this.confirmDialog.confirm(
      'Revoke group access',
      `Remove ${employeeName} from ${groups.length} selected group${groups.length === 1 ? '' : 's'}?`,
      { confirmText: 'Revoke', variant: 'danger' },
    );
    if (!confirmed) return;

    this.savingMembers.set(true);
    let revoked = 0;
    const failedIds = new Set<string>();

    try {
      for (const group of groups) {
        try {
          await this.firstValue(this.aclService.removeMembership(group.id, employeeId));
          this.memberRoleIds.update((current) => {
            const next = new Set(current);
            next.delete(group.id);
            return next;
          });
          revoked += 1;
        } catch {
          failedIds.add(group.id);
        }
      }

      this.memberGroupSelection.set(failedIds);

      if (revoked > 0) {
        this.notifications.success(
          `${employeeName} removed from ${revoked} group${revoked === 1 ? '' : 's'}.`,
        );
      }
      if (failedIds.size > 0) {
        this.notifications.error(
          `${failedIds.size} group${failedIds.size === 1 ? '' : 's'} could not be revoked.`,
        );
      }

      await this.loadGroups();
      await this.refreshMemberMemberships();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingMembers.set(false);
    }
  }

  async applySelectedGroups(): Promise<void> {
    if (this.memberMode() === 'grant') await this.grantSelectedGroups();
    else await this.revokeSelectedGroups();
  }

  private async refreshMemberMemberships(): Promise<void> {
    const employeeId = this.memberEmployeeId();
    if (!employeeId) return;
    try {
      const rows = await this.firstValue(this.aclService.getMemberships({ userId: employeeId }));
      if (this.memberEmployeeId() === employeeId) {
        this.memberRoleIds.set(new Set(rows.map((row) => row.roleId)));
      }
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
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
    this.rightSelection.set(new Set());
    this.userRightsMode.set('grant');
    this.loadingUserRights.set(true);
    try {
      const rows = await this.firstValue(this.aclService.getUserRights(employeeId));
      if (this.rightEmployeeId() !== employeeId) return;
      this.userRights.set(rows);
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      if (this.rightEmployeeId() === employeeId) this.loadingUserRights.set(false);
    }
  }

  setUserRightsMode(mode: AssignmentMode): void {
    if (this.userRightsMode() === mode) return;
    this.userRightsMode.set(mode);
    this.rightSelection.set(new Set());
  }

  isRightSelected(right: AccessRight): boolean {
    return this.rightSelection().has(right.id);
  }

  toggleRightSelection(right: AccessRight, selected: boolean): void {
    if (!this.visibleRights().some((row) => row.id === right.id)) return;
    this.rightSelection.update((current) => {
      const next = new Set(current);
      if (selected) next.add(right.id);
      else next.delete(right.id);
      return next;
    });
  }

  toggleSelectAllRights(selected: boolean): void {
    this.rightSelection.update((current) => {
      const next = new Set(current);
      for (const right of this.visibleRights()) {
        if (selected) next.add(right.id);
        else next.delete(right.id);
      }
      return next;
    });
  }

  clearRightSelection(): void {
    this.rightSelection.set(new Set());
  }

  grantSelectedRights(): void {
    if (!this.rightEmployeeId() || !this.canManageUserRights() || this.savingRight()) return;

    const rights = this.selectedRights().filter(
      (right) => !this.directEffects().has(right.id),
    );
    if (rights.length === 0) return;

    this.rightReason.set('');
    this.rightDialog.set({ rights });
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
    let granted = 0;
    const failedIds = new Set<string>();

    try {
      for (const right of dialog.rights) {
        try {
          await this.firstValue(
            this.aclService.setUserRight(employeeId, right.id, 'Grant', reason),
          );
          granted += 1;
        } catch {
          failedIds.add(right.id);
        }
      }

      this.rightSelection.set(failedIds);

      if (granted > 0) {
        this.notifications.success(
          `Granted ${granted} right${granted === 1 ? '' : 's'} directly.`,
        );
      }
      if (failedIds.size > 0) {
        this.notifications.error(
          `${failedIds.size} right${failedIds.size === 1 ? '' : 's'} could not be granted.`,
        );
      }

      this.rightDialog.set(null);
      await this.refreshUserRights();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingRight.set(false);
    }
  }

  async revokeSelectedRights(): Promise<void> {
    const employeeId = this.rightEmployeeId();
    const employee = this.rightEmployee();
    const rights = this.selectedRights().filter((right) => this.directEffects().has(right.id));
    if (!employeeId || !this.canManageUserRights() || this.savingRight() || rights.length === 0) {
      return;
    }

    const confirmed = await this.confirmDialog.confirm(
      'Revoke direct rights',
      `Remove the direct assignment of ${rights.length} selected right${rights.length === 1 ? '' : 's'} from ${employee ? this.employeeName(employee) : 'the employee'}? Group rights are unaffected.`,
      { confirmText: 'Revoke', variant: 'danger' },
    );
    if (!confirmed) return;

    this.savingRight.set(true);
    let revoked = 0;
    const failedIds = new Set<string>();

    try {
      for (const right of rights) {
        try {
          await this.firstValue(this.aclService.removeUserRight(employeeId, right.id));
          revoked += 1;
        } catch {
          failedIds.add(right.id);
        }
      }

      this.rightSelection.set(failedIds);

      if (revoked > 0) {
        this.notifications.success(
          `Revoked ${revoked} direct right${revoked === 1 ? '' : 's'}.`,
        );
      }
      if (failedIds.size > 0) {
        this.notifications.error(
          `${failedIds.size} right${failedIds.size === 1 ? '' : 's'} could not be revoked.`,
        );
      }

      await this.refreshUserRights();
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingRight.set(false);
    }
  }

  applySelectedRights(): void {
    if (this.userRightsMode() === 'grant') this.grantSelectedRights();
    else void this.revokeSelectedRights();
  }

  private async refreshUserRights(): Promise<void> {
    const employeeId = this.rightEmployeeId();
    if (!employeeId) return;
    try {
      const rows = await this.firstValue(this.aclService.getUserRights(employeeId));
      if (this.rightEmployeeId() === employeeId) {
        this.userRights.set(rows);
      }
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  employeeName(employee: EmployeeHrInfo): string {
    const parts = [employee.firstName, employee.middleName, employee.lastName].filter(
      (part): part is string => !!part && part.trim().length > 0,
    );
    if (parts.length > 0) return parts.join(' ');
    return employee.idCode || employee.email || employee.empId || 'Unknown';
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
    assignment: 'all' | 'assigned' | 'unassigned' = 'all',
  ): RightModule[] {
    const search = term.trim().toLowerCase();
    const byModule = new Map<string, RightOptionRow[]>();
    for (const right of this.rights()) {
      const haystack = `${right.name} ${right.module} ${right.description ?? ''}`.toLowerCase();
      if (search && !haystack.includes(search)) continue;

      const assigned = effects.has(right.id);
      if (assignment === 'assigned' && !assigned) continue;
      if (assignment === 'unassigned' && assigned) continue;

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

  private handleLoadError(error: unknown): void {
    const message = toApiError(error).message;
    this.loadError.set(message);
    this.notifications.error(message);
  }
}
