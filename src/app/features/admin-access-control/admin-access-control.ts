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
  AccessDirectoryUser,
  AccessEffect,
  AccessGroup,
  AccessRight,
  AccessSummary,
  AuthorizationAuditEntry,
  EffectiveAccessEntry,
  EffectiveAccessResult,
  GroupMembershipRow,
  GroupRightRow,
  UserRightRow,
} from './admin-access-control.model';

type TabKey =
  | 'overview'
  | 'groups'
  | 'group-rights'
  | 'memberships'
  | 'rights'
  | 'user-rights'
  | 'effective-access'
  | 'audit';

@Component({
  selector: 'app-admin-access-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-access-control.html',
  styleUrl: './admin-access-control.scss',
})
export class AdminAccessControlPage {
  private readonly aclService = inject(AdminAccessControlService);
  private readonly notifications = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly userStore = inject(UserStore);

  readonly Permission = {
    page: 'admin:access.view',
    groups: 'admin:access.groups.manage',
    rights: 'admin:access.rights.manage',
    userRights: 'admin:access.user-rights.manage',
    audit: 'admin:audit.view',
  } as const;

  readonly activeTab = signal<TabKey>('overview');
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly summary = signal<AccessSummary | null>(null);
  readonly groups = signal<AccessGroup[]>([]);
  readonly rights = signal<AccessRight[]>([]);
  readonly directory = signal<AccessDirectoryUser[]>([]);
  readonly memberships = signal<GroupMembershipRow[]>([]);
  readonly groupRights = signal<GroupRightRow[]>([]);
  readonly userRights = signal<UserRightRow[]>([]);
  readonly effective = signal<EffectiveAccessResult | null>(null);
  readonly audit = signal<AuthorizationAuditEntry[]>([]);

  readonly tabs = [
    { key: 'overview' as TabKey, label: 'Overview' },
    { key: 'groups' as TabKey, label: 'Groups' },
    { key: 'group-rights' as TabKey, label: 'Group Rights' },
    { key: 'memberships' as TabKey, label: 'Memberships' },
    { key: 'rights' as TabKey, label: 'Rights Catalog' },
    { key: 'user-rights' as TabKey, label: 'User Rights' },
    { key: 'effective-access' as TabKey, label: 'Effective Access' },
    { key: 'audit' as TabKey, label: 'Authorization Audit' },
  ];

  // Permission-driven tab visibility (rows are enforced backend-side by ADR-011).
  readonly visibleTabs = computed(() =>
    this.tabs.filter((tab) => {
      if (tab.key === 'audit') {
        return this.canViewAudit();
      }
      return this.canViewPage();
    }),
  );

  readonly canViewPage = computed(() => this.userStore.hasPermission(this.Permission.page));
  readonly canManageGroups = computed(() => this.userStore.hasPermission(this.Permission.groups));
  readonly canManageRights = computed(() => this.userStore.hasPermission(this.Permission.rights));
  readonly canManageUserRights = computed(() =>
    this.userStore.hasPermission(this.Permission.userRights),
  );
  readonly canViewAudit = computed(() => this.userStore.hasPermission(this.Permission.audit));

  // Form state
  readonly newGroupName = signal('');
  readonly newGroupDescription = signal('');
  readonly creatingGroup = signal(false);

  readonly newRightName = signal('');
  readonly newRightModule = signal('');
  readonly newRightDescription = signal('');
  readonly creatingRight = signal(false);

  readonly selectedGroupId = signal<string | null>(null);
  readonly selectedUserId = signal<string | null>(null);
  readonly selectedMembershipUserId = signal('');

  readonly userRightPermissionId = signal('');
  readonly userRightEffect = signal<AccessEffect>('Grant');
  readonly userRightReason = signal('');
  readonly savingUserRight = signal(false);

  constructor() {
    void this.loadOverview();
  }

  selectTab(tab: TabKey): void {
    this.activeTab.set(tab);
    const lazyTabs: TabKey[] = [
      'groups',
      'group-rights',
      'memberships',
      'rights',
      'user-rights',
      'effective-access',
      'audit',
    ];
    if (lazyTabs.includes(tab)) {
      void this.loadTab(tab);
    }
  }

  async loadOverview(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const summary = await this.firstValue(this.aclService.loadSummary());
      this.summary.set(summary);
    } catch (error) {
      this.handleLoadError(error);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTab(tab: TabKey): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      switch (tab) {
        case 'groups':
          this.groups.set(await this.firstValue(this.aclService.getGroups()));
          break;
        case 'group-rights':
          if (!this.selectedGroupId()) {
            const groups = await this.firstValue(this.aclService.getGroups());
            this.groups.set(groups);
            this.selectedGroupId.set(groups[0]?.id ?? null);
          }
          if (this.selectedGroupId()) {
            this.groupRights.set(
              await this.firstValue(this.aclService.getGroupRights(this.selectedGroupId()!)),
            );
          }
          break;
        case 'memberships':
          this.memberships.set(await this.firstValue(this.aclService.getMemberships()));
          break;
        case 'rights':
          this.rights.set(await this.firstValue(this.aclService.getRightsCatalog()));
          break;
        case 'user-rights':
        case 'effective-access':
          if (!this.selectedUserId()) {
            const directory = await this.firstValue(this.aclService.getDirectory());
            this.directory.set(directory);
            this.selectedUserId.set(directory[0]?.id ?? null);
          }
          if (this.selectedUserId()) {
            if (tab === 'user-rights') {
              this.userRights.set(
                await this.firstValue(this.aclService.getUserRights(this.selectedUserId()!)),
              );
            } else {
              this.effective.set(
                await this.firstValue(
                  this.aclService.getEffectiveAccess(this.selectedUserId()!),
                ),
              );
            }
          }
          break;
        case 'audit':
          this.audit.set(await this.firstValue(this.aclService.getAuthorizationAudit()));
          break;
        default:
          break;
      }
    } catch (error) {
      this.handleLoadError(error);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Groups ─────────────────────────────────────────────────────────────

  async createGroup(): Promise<void> {
    if (!this.canManageGroups() || this.creatingGroup()) return;
    const name = this.newGroupName().trim();
    if (!name) {
      this.notifications.error('Group name is required.');
      return;
    }
    this.creatingGroup.set(true);
    try {
      await this.firstValue(
        this.aclService.createGroup(name, this.newGroupDescription().trim() || null),
      );
      this.newGroupName.set('');
      this.newGroupDescription.set('');
      this.notifications.success('Access group created.');
      this.groups.set(await this.firstValue(this.aclService.getGroups()));
      this.summary.set(await this.firstValue(this.aclService.loadSummary()));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.creatingGroup.set(false);
    }
  }

  async toggleGroupStatus(group: AccessGroup): Promise<void> {
    if (!this.canManageGroups()) return;
    const target = !group.isActive;
    const confirmed = await this.confirmDialog.confirm(
      target ? 'Activate group' : 'Deactivate group',
      target
        ? `Activate access group '${group.name}'?`
        : `Deactivate access group '${group.name}'? Its members lose every right granted only through this group.`,
      { variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(this.aclService.setGroupStatus(group.id, target));
      this.notifications.success(
        target ? 'Access group activated.' : 'Access group deactivated.',
      );
      this.groups.set(await this.firstValue(this.aclService.getGroups()));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  // ── Group rights ───────────────────────────────────────────────────────

  async onGroupSelected(groupId: string): Promise<void> {
    this.selectedGroupId.set(groupId);
    try {
      this.groupRights.set(await this.firstValue(this.aclService.getGroupRights(groupId)));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  async setGroupRight(rightId: string, effect: AccessEffect): Promise<void> {
    if (!this.canManageGroups() || !this.selectedGroupId()) return;
    try {
      await this.firstValue(
        this.aclService.setGroupRight(this.selectedGroupId()!, rightId, effect),
      );
      this.notifications.success(`Right set to ${effect.toLowerCase()} for this group.`);
      this.groupRights.set(
        await this.firstValue(this.aclService.getGroupRights(this.selectedGroupId()!)),
      );
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  async removeGroupRight(row: GroupRightRow): Promise<void> {
    if (!this.canManageGroups() || !this.selectedGroupId()) return;
    const confirmed = await this.confirmDialog.confirm(
      'Remove group right',
      `Remove '${row.permissionName}' from group '${row.roleName}'?`,
      { variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(
        this.aclService.removeGroupRight(this.selectedGroupId()!, row.permissionId),
      );
      this.notifications.success('Group right removed.');
      this.groupRights.set(
        await this.firstValue(this.aclService.getGroupRights(this.selectedGroupId()!)),
      );
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  groupRightEffectOf(permissionId: string): AccessEffect | null {
    const row = this.groupRights().find((r) => r.permissionId === permissionId);
    return row ? (row.effect === 'Deny' ? 'Deny' : 'Grant') : null;
  }

  selectableRights(): AccessRight[] {
    return this.rights().length > 0
      ? this.rights()
      : [];
  }

  // ── Memberships ────────────────────────────────────────────────────────

  async assignMembership(): Promise<void> {
    if (!this.canManageGroups()) return;
    const userId = this.selectedMembershipUserId();
    const groupId = this.selectedGroupId();
    if (!userId || !groupId) {
      this.notifications.error('Select an employee and an access group first.');
      return;
    }
    try {
      await this.firstValue(this.aclService.assignMembership(groupId, userId));
      this.notifications.success('Member assigned to group.');
      this.selectedMembershipUserId.set('');
      this.memberships.set(await this.firstValue(this.aclService.getMemberships()));
      this.groups.set(await this.firstValue(this.aclService.getGroups()));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  async removeMembership(row: GroupMembershipRow): Promise<void> {
    if (!this.canManageGroups()) return;
    const confirmed = await this.confirmDialog.confirm(
      'Remove membership',
      `Remove ${row.fullName} from group '${row.roleName}'?`,
      { variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(this.aclService.removeMembership(row.roleId, row.userId));
      this.notifications.success('Member removed from group.');
      this.memberships.set(await this.firstValue(this.aclService.getMemberships()));
      this.groups.set(await this.firstValue(this.aclService.getGroups()));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  // ── Rights catalog ─────────────────────────────────────────────────────

  async createRight(): Promise<void> {
    if (!this.canManageRights() || this.creatingRight()) return;
    const name = this.newRightName().trim();
    const module = this.newRightModule().trim();
    if (!name || !module) {
      this.notifications.error('Right key and module are required.');
      return;
    }
    if (!name.startsWith(`${module}:`)) {
      this.notifications.error('Module must match the module segment of the right key.');
      return;
    }
    this.creatingRight.set(true);
    try {
      await this.firstValue(
        this.aclService.createRight(name, module, this.newRightDescription().trim() || null),
      );
      this.newRightName.set('');
      this.newRightModule.set('');
      this.newRightDescription.set('');
      this.notifications.success('Right created.');
      this.rights.set(await this.firstValue(this.aclService.getRightsCatalog()));
      this.summary.set(await this.firstValue(this.aclService.loadSummary()));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.creatingRight.set(false);
    }
  }

  async deleteRight(right: AccessRight): Promise<void> {
    if (!this.canManageRights()) return;
    if (right.referenced) {
      this.notifications.error(
        'The right is still referenced by group or direct assignments. Remove those first.',
      );
      return;
    }
    const confirmed = await this.confirmDialog.confirm(
      'Delete right',
      `Delete right '${right.name}' from the catalog?`,
      { variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(this.aclService.deleteRight(right.id));
      this.notifications.success('Right deleted.');
      this.rights.set(await this.firstValue(this.aclService.getRightsCatalog()));
      this.summary.set(await this.firstValue(this.aclService.loadSummary()));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  // ── User rights ────────────────────────────────────────────────────────

  async onUserSelected(userId: string): Promise<void> {
    this.selectedUserId.set(userId);
    try {
      this.userRights.set(await this.firstValue(this.aclService.getUserRights(userId)));
      this.effective.set(null);
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  async saveUserRight(): Promise<void> {
    if (!this.canManageUserRights() || this.savingUserRight()) return;
    const userId = this.selectedUserId();
    const rightId = this.userRightPermissionId();
    const reason = this.userRightReason().trim();
    if (!userId || !rightId) {
      this.notifications.error('Select an employee and a right first.');
      return;
    }
    if (!reason) {
      this.notifications.error('A justification reason is required for every direct user right.');
      return;
    }
    this.savingUserRight.set(true);
    try {
      await this.firstValue(
        this.aclService.setUserRight(userId, rightId, this.userRightEffect(), reason),
      );
      this.userRightPermissionId.set('');
      this.userRightReason.set('');
      this.notifications.success('User right saved.');
      this.userRights.set(await this.firstValue(this.aclService.getUserRights(userId)));
      this.summary.set(await this.firstValue(this.aclService.loadSummary()));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.savingUserRight.set(false);
    }
  }

  async removeUserRight(row: UserRightRow): Promise<void> {
    if (!this.canManageUserRights()) return;
    const confirmed = await this.confirmDialog.confirm(
      'Remove user right',
      `Remove ${row.effect.toLowerCase()} '${row.permissionName}' from ${row.fullName}?`,
      { variant: 'danger' },
    );
    if (!confirmed) return;

    try {
      await this.firstValue(
        this.aclService.removeUserRight(row.userId, row.permissionId),
      );
      this.notifications.success('User right removed.');
      this.userRights.set(await this.firstValue(this.aclService.getUserRights(row.userId)));
      this.summary.set(await this.firstValue(this.aclService.loadSummary()));
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  // ── Effective access ───────────────────────────────────────────────────

  async evaluateEffective(): Promise<void> {
    if (!this.selectedUserId()) {
      this.notifications.error('Select an employee first.');
      return;
    }
    try {
      this.effective.set(
        await this.firstValue(this.aclService.getEffectiveAccess(this.selectedUserId()!)),
      );
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    }
  }

  resultTone(result: string): string {
    return result === 'Granted' ? 'granted' : 'denied';
  }

  grantedCount(entries: EffectiveAccessEntry[]): number {
    return entries.filter((entry) => entry.result === 'Granted').length;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private firstValue<T>(observable$: Observable<T>): Promise<T> {
    return firstValueFrom(observable$);
  }

  private handleLoadError(error: unknown): void {
    this.loadError.set(toApiError(error).message);
    this.notifications.error(toApiError(error).message);
  }

  userNameById(id: string): string {
    const user = this.directory().find((d) => d.id === id);
    return user ? `${user.fullName} (${user.username})` : id;
  }

  groupNameById(id: string): string {
    return this.groups().find((g) => g.id === id)?.name ?? id;
  }
}
