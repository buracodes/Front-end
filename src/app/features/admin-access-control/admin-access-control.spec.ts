import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AuthUser } from '../../core/model/auth.model';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import {
  AccessGroup,
  AccessRight,
  EmployeeHrInfo,
  GroupRightRow,
  UserRightRow,
} from './admin-access-control.model';
import { AdminAccessControlPage } from './admin-access-control';

const PAGE_PERMISSION = 'admin:access.view';
const GROUPS_PERMISSION = 'admin:access.groups.manage';
const USER_RIGHTS_PERMISSION = 'admin:access.user-rights.manage';

function group(overrides: Partial<AccessGroup> = {}): AccessGroup {
  return {
    id: 'g-1',
    name: 'Coordinators',
    description: 'Division coordinators',
    memberCount: 2,
    rightCount: 4,
    denyCount: 0,
    isActive: true,
    status: 'Active',
    lastUpdated: '2026-10-18T09:00:00Z',
    ...overrides,
  };
}

function right(overrides: Partial<AccessRight> = {}): AccessRight {
  return {
    id: 'r-1',
    name: 'kpi:view',
    module: 'kpi',
    description: 'View KPIs',
    groupAssignments: 1,
    directAssignments: 0,
    referenced: true,
    status: 'Active',
    lastUpdated: null,
    ...overrides,
  };
}

function employee(overrides: Partial<EmployeeHrInfo> = {}): EmployeeHrInfo {
  return {
    empId: '11111111-1111-1111-1111-111111111111',
    idCode: 'EMP-001',
    firstName: 'Dereje',
    middleName: 'Kebede',
    lastName: 'Girma',
    email: 'dereje.kebede@ecx.com.et',
    positionId: null,
    positionName: 'Planner',
    positionLevel: null,
    divisionId: null,
    divisionName: 'Trading',
    departmentId: null,
    departmentName: null,
    branchId: null,
    branchName: null,
    ...overrides,
  };
}

function userRight(overrides: Partial<UserRightRow> = {}): UserRightRow {
  return {
    userId: '11111111-1111-1111-1111-111111111111',
    permissionId: 'r-1',
    username: 'dereje.kebede',
    fullName: 'Dereje Kebede Girma',
    permissionName: 'kpi:view',
    module: 'kpi',
    effect: 'Grant',
    reason: 'Reports owner',
    assignedAt: '2026-10-18T09:00:00Z',
    assignedByName: 'admin',
    ...overrides,
  };
}

describe('AdminAccessControlPage', () => {
  function setup(
    permissions: string[] = [PAGE_PERMISSION, GROUPS_PERMISSION, USER_RIGHTS_PERMISSION],
  ): {
    http: HttpTestingController;
    notifications: NotificationService;
    confirmDialog: ConfirmDialogService;
    page: AdminAccessControlPage;
  } {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const http = TestBed.inject(HttpTestingController);
    const notifications = TestBed.inject(NotificationService);
    const confirmDialog = TestBed.inject(ConfirmDialogService);

    TestBed.inject(UserStore).setUser({
      id: 'u-1',
      username: 'admin',
      fullName: 'System Administrator',
      roles: ['Admin'],
      permissions,
    } satisfies Partial<AuthUser> as AuthUser);

    const page = TestBed.runInInjectionContext(() => new AdminAccessControlPage());
    return { http, notifications, confirmDialog, page };
  }

  async function flushInitial(
    http: HttpTestingController,
    payloads: {
      groups?: AccessGroup[];
      rights?: AccessRight[];
      employees?: EmployeeHrInfo[];
    } = {},
  ): Promise<void> {
    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/groups'))
      .flush({ success: true, data: payloads.groups ?? [group()] });
    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/rights'))
      .flush({ success: true, data: payloads.rights ?? [right()] });
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/employees'))
      .flush({ success: true, data: payloads.employees ?? [employee()] });
    await Promise.resolve();
  }

  const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

  it('exposes exactly the four access-control tabs', () => {
    const { page } = setup();
    expect(page.tabs.map((tab) => tab.label)).toEqual([
      'Groups',
      'Group Rights',
      'Group Members',
      'User Rights',
    ]);
  });

  it('filters the group table by name and description', async () => {
    const { http, page } = setup();
    await flushInitial(http, {
      groups: [
        group({ id: 'g-1', name: 'Coordinators', description: 'Division coordinators' }),
        group({ id: 'g-2', name: 'Auditors', description: 'Read-only review' }),
      ],
    });

    page.groupSearch.set('audit');
    expect(page.filteredGroups().map((row) => row.id)).toEqual(['g-2']);

    page.groupSearch.set('coordinators');
    expect(page.filteredGroups().map((row) => row.id)).toEqual(['g-1']);
    http.verify();
  });

  it('refuses to create a group without a name and fires no request', async () => {
    const { http, notifications, page } = setup();
    const errorSpy = vi.spyOn(notifications, 'error');
    await flushInitial(http);

    page.openCreateGroup();
    page.groupFormName.set('   ');
    await page.saveGroup();

    expect(errorSpy).toHaveBeenCalledWith('Group name is required.');
    http.verify();
  });

  it('creates a group through the groups endpoint and reloads the list', async () => {
    const { http, notifications, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');
    await flushInitial(http);

    page.openCreateGroup();
    page.groupFormName.set('Auditors');
    page.groupFormDescription.set('Read-only review');
    const saving = page.saveGroup();

    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'POST' && req.url.endsWith('accesscontrol/groups'))
      .flush({ success: true, data: group({ name: 'Auditors' }) });
    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/groups'))
      .flush({ success: true, data: [group({ name: 'Auditors' })] });
    await saving;

    expect(successSpy).toHaveBeenCalledWith('Group created.');
    expect(page.groupDialog()).toBeNull();
  });

  it('separates granted rights from grantable ones for the selected group', async () => {
    const { http, page } = setup();
    await flushInitial(http, {
      rights: [right({ id: 'r-1' }), right({ id: 'r-2', name: 'kpi:edit' })],
    });

    const selecting = page.selectGroup(group());

    await nextTask();
    const assigned: GroupRightRow = {
      roleId: 'g-1',
      permissionId: 'r-1',
      roleName: 'Coordinators',
      permissionName: 'kpi:view',
      module: 'kpi',
      effect: 'Grant',
      assignedAt: '2026-10-18T09:00:00Z',
      assignedByName: 'admin',
    };
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('groups/g-1/rights'))
      .flush({ success: true, data: [assigned] });
    await selecting;

    expect(page.groupRightsMode()).toBe('grant');
    expect(page.visibleGroupRights().map((row) => row.id)).toEqual(['r-2']);

    page.setGroupRightsMode('revoke');
    expect(page.visibleGroupRights().map((row) => row.id)).toEqual(['r-1']);
    expect(page.visibleGroupRights()[0].effect).toBe('Grant');
    http.verify();
  });

  it('filters the group picker by name and hides inactive groups', async () => {
    const { http, page } = setup();
    await flushInitial(http, {
      groups: [
        group({ id: 'g-1', name: 'Coordinators' }),
        group({ id: 'g-2', name: 'Auditors' }),
        group({ id: 'g-3', name: 'Retired', isActive: false }),
      ],
    });

    expect(page.groupOptions().map((row) => row.id)).toEqual(['g-2', 'g-1']);

    page.groupSearchTerm.set('audi');
    expect(page.groupOptions().map((row) => row.id)).toEqual(['g-2']);
    http.verify();
  });

  it('grants every selected right that is not assigned to the group', async () => {
    const { http, notifications, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');
    await flushInitial(http, {
      rights: [
        right({ id: 'r-1', name: 'kpi:view' }),
        right({ id: 'r-2', name: 'kpi:edit' }),
        right({ id: 'r-3', name: 'reports:export', module: 'reports' }),
      ],
    });

    const selecting = page.selectGroup(group());
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('groups/g-1/rights'))
      .flush({
        success: true,
        data: [
          {
            roleId: 'g-1',
            permissionId: 'r-1',
            roleName: 'Coordinators',
            permissionName: 'kpi:view',
            module: 'kpi',
            effect: 'Grant',
            assignedAt: '2026-10-18T09:00:00Z',
            assignedByName: 'admin',
          } satisfies GroupRightRow,
        ],
      });
    await selecting;

    page.toggleSelectAllGroupRights(true);
    expect([...page.groupRightSelection()].sort()).toEqual(['r-2', 'r-3']);

    const granting = page.grantSelectedGroupRights();

    await nextTask();
    http
      .expectOne(
        (req) => req.method === 'PUT' && req.url.endsWith('accesscontrol/groups/g-1/rights/r-2'),
      )
      .flush({ success: true, data: {} });
    await nextTask();
    http
      .expectOne(
        (req) => req.method === 'PUT' && req.url.endsWith('accesscontrol/groups/g-1/rights/r-3'),
      )
      .flush({ success: true, data: {} });
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/groups'))
      .flush({ success: true, data: [group()] });
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('groups/g-1/rights'))
      .flush({ success: true, data: [] });
    await granting;

    expect(successSpy).toHaveBeenCalledWith('Granted 2 rights to Coordinators.');
    expect(page.groupRightSelectedCount()).toBe(0);
    http.verify();
  });

  it('revokes every selected right that is assigned to the group', async () => {
    const { http, notifications, confirmDialog, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    await flushInitial(http, {
      rights: [right({ id: 'r-1' }), right({ id: 'r-2', name: 'kpi:edit' })],
    });

    const selecting = page.selectGroup(group());
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('groups/g-1/rights'))
      .flush({
        success: true,
        data: [
          {
            roleId: 'g-1',
            permissionId: 'r-1',
            roleName: 'Coordinators',
            permissionName: 'kpi:view',
            module: 'kpi',
            effect: 'Grant',
            assignedAt: '2026-10-18T09:00:00Z',
            assignedByName: 'admin',
          } satisfies GroupRightRow,
          {
            roleId: 'g-1',
            permissionId: 'r-2',
            roleName: 'Coordinators',
            permissionName: 'kpi:edit',
            module: 'kpi',
            effect: 'Grant',
            assignedAt: '2026-10-18T09:00:00Z',
            assignedByName: 'admin',
          } satisfies GroupRightRow,
        ],
      });
    await selecting;

    page.setGroupRightsMode('revoke');
    page.toggleSelectAllGroupRights(true);
    expect([...page.groupRightSelection()].sort()).toEqual(['r-1', 'r-2']);

    const revoking = page.revokeSelectedGroupRights();

    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'DELETE' && req.url.endsWith('accesscontrol/groups/g-1/rights/r-1'),
      )
      .flush({ success: true, data: true });
    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'DELETE' && req.url.endsWith('accesscontrol/groups/g-1/rights/r-2'),
      )
      .flush({ success: true, data: true });
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/groups'))
      .flush({ success: true, data: [group()] });
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('groups/g-1/rights'))
      .flush({ success: true, data: [] });
    await revoking;

    expect(successSpy).toHaveBeenCalledWith('Revoked 2 rights from Coordinators.');
    expect(page.groupRightSelectedCount()).toBe(0);
    http.verify();
  });

  it('builds the employee display name from first, middle and grandfather names', async () => {
    const { http, page } = setup();
    await flushInitial(http);

    expect(page.employeeName(employee())).toBe('Dereje Kebede Girma');
    http.verify();
  });

  it('tracks the employee directory load so the tabs can show progress', async () => {
    const { http, notifications, page } = setup();
    const errorSpy = vi.spyOn(notifications, 'error');
    expect(page.employeesLoading()).toBe(true);

    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/groups'))
      .flush({ success: true, data: [group()] });
    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/rights'))
      .flush({ success: true, data: [right()] });
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/employees'))
      .flush(
        { message: 'Login failed for user dbaccess.' },
        { status: 500, statusText: 'Server Error' },
      );
    await Promise.resolve();

    expect(page.employeesLoading()).toBe(false);
    expect(page.employeesLoadFailed()).toBe(true);
    expect(page.employees()).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    http.verify();
  });

  it('loads the memberships of the selected HR employee', async () => {
    const { http, page } = setup();
    await flushInitial(http);

    const selecting = page.selectMemberEmployee(employee());

    await Promise.resolve();
    http
      .expectOne(
        (req) =>
          req.method === 'GET' &&
          req.url.includes('accesscontrol/memberships') &&
          req.url.includes('userId=11111111-1111-1111-1111-111111111111'),
      )
      .flush({
        success: true,
        data: [
          {
            userId: '11111111-1111-1111-1111-111111111111',
            roleId: 'g-1',
            username: 'dereje.kebede',
            fullName: 'Dereje Kebede',
            roleName: 'Coordinators',
            assignedAt: '2026-10-18T09:00:00Z',
            assignedByName: 'admin',
          },
        ],
      });
    await selecting;

    expect(page.memberRoleIds().has('g-1')).toBe(true);
    http.verify();
  });

  it('selects every group the employee does not belong to yet', async () => {
    const { http, page } = setup();
    await flushInitial(http, {
      groups: [
        group({ id: 'g-1', name: 'Coordinators' }),
        group({ id: 'g-2', name: 'Auditors' }),
        group({ id: 'g-3', name: 'Viewers' }),
      ],
    });

    const selecting = page.selectMemberEmployee(employee());
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/memberships'))
      .flush({
        success: true,
        data: [
          {
            userId: '11111111-1111-1111-1111-111111111111',
            roleId: 'g-1',
            username: 'dereje.kebede',
            fullName: 'Dereje Kebede Girma',
            roleName: 'Coordinators',
            assignedAt: '2026-10-18T09:00:00Z',
            assignedByName: 'admin',
          },
        ],
      });
    await selecting;

    page.toggleSelectAllMemberGroups(true);

    expect([...page.memberGroupSelection()].sort()).toEqual(['g-2', 'g-3']);
    expect(page.allModeGroupsSelected()).toBe(true);
    http.verify();
  });

  it('assigns every selected group to the employee, skipping the ones they belong to', async () => {
    const { http, notifications, confirmDialog, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    await flushInitial(http, {
      groups: [
        group({ id: 'g-1', name: 'Coordinators' }),
        group({ id: 'g-2', name: 'Auditors' }),
        group({ id: 'g-3', name: 'Viewers' }),
      ],
    });

    const selecting = page.selectMemberEmployee(employee());
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/memberships'))
      .flush({
        success: true,
        data: [
          {
            userId: '11111111-1111-1111-1111-111111111111',
            roleId: 'g-1',
            username: 'dereje.kebede',
            fullName: 'Dereje Kebede Girma',
            roleName: 'Coordinators',
            assignedAt: '2026-10-18T09:00:00Z',
            assignedByName: 'admin',
          },
        ],
      });
    await selecting;

    page.toggleSelectAllMemberGroups(true);
    const granting = page.grantSelectedGroups();

    await nextTask();
    http
      .expectOne(
        (req) => req.method === 'POST' && req.url.endsWith('accesscontrol/groups/g-2/members'),
      )
      .flush({ success: true, data: {} });
    await nextTask();
    http
      .expectOne(
        (req) => req.method === 'POST' && req.url.endsWith('accesscontrol/groups/g-3/members'),
      )
      .flush({ success: true, data: {} });
    await nextTask();

    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/groups'))
      .flush({
        success: true,
        data: [
          group({ id: 'g-1', name: 'Coordinators' }),
          group({ id: 'g-2', name: 'Auditors' }),
          group({ id: 'g-3', name: 'Viewers' }),
        ],
      });
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/memberships'))
      .flush({
        success: true,
        data: [
          { userId: '11111111-1111-1111-1111-111111111111', roleId: 'g-1' },
          { userId: '11111111-1111-1111-1111-111111111111', roleId: 'g-2' },
          { userId: '11111111-1111-1111-1111-111111111111', roleId: 'g-3' },
        ],
      });
    await granting;

    expect(successSpy).toHaveBeenCalledWith('Dereje Kebede Girma added to 2 groups.');
    expect(page.memberRoleIds().has('g-2')).toBe(true);
    expect(page.memberRoleIds().has('g-3')).toBe(true);
    expect(page.memberGroupSelectedCount()).toBe(0);
    http.verify();
  });

  it('revokes every selected group the employee currently belongs to', async () => {
    const { http, notifications, confirmDialog, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    await flushInitial(http, {
      groups: [
        group({ id: 'g-1', name: 'Coordinators' }),
        group({ id: 'g-2', name: 'Auditors' }),
      ],
    });

    const selecting = page.selectMemberEmployee(employee());
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/memberships'))
      .flush({
        success: true,
        data: [
          {
            userId: '11111111-1111-1111-1111-111111111111',
            roleId: 'g-1',
            username: 'dereje.kebede',
            fullName: 'Dereje Kebede Girma',
            roleName: 'Coordinators',
            assignedAt: '2026-10-18T09:00:00Z',
            assignedByName: 'admin',
          },
        ],
      });
    await selecting;

    page.setMemberMode('revoke');
    expect(page.memberModeGroups().map((row) => row.id)).toEqual(['g-1']);

    page.toggleSelectAllMemberGroups(true);
    expect([...page.memberGroupSelection()]).toEqual(['g-1']);

    const revoking = page.revokeSelectedGroups();

    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'DELETE' &&
          req.url.endsWith(
            'accesscontrol/groups/g-1/members/11111111-1111-1111-1111-111111111111',
          ),
      )
      .flush({ success: true, data: true });
    await nextTask();

    http
      .expectOne((req) => req.method === 'GET' && req.url.endsWith('accesscontrol/groups'))
      .flush({
        success: true,
        data: [
          group({ id: 'g-1', name: 'Coordinators' }),
          group({ id: 'g-2', name: 'Auditors' }),
        ],
      });
    await nextTask();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/memberships'))
      .flush({ success: true, data: [] });
    await revoking;

    expect(successSpy).toHaveBeenCalledWith('Dereje Kebede Girma removed from 1 group.');
    expect(page.memberRoleIds().has('g-1')).toBe(false);
    expect(page.memberGroupSelectedCount()).toBe(0);
    http.verify();
  });

  it('selects and clears every visible right', async () => {
    const { http, page } = setup();
    await flushInitial(http, {
      rights: [right({ id: 'r-1' }), right({ id: 'r-2', name: 'kpi:edit' })],
    });

    page.toggleSelectAllRights(true);
    expect(page.selectedRightCount()).toBe(2);
    expect(page.allVisibleRightsSelected()).toBe(true);

    page.toggleSelectAllRights(false);
    expect(page.selectedRightCount()).toBe(0);
    expect(page.someVisibleRightsSelected()).toBe(false);
    http.verify();
  });

  it('grants every selected right that is not already granted, with one shared reason', async () => {
    const { http, notifications, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');
    await flushInitial(http, {
      rights: [
        right({ id: 'r-1', name: 'kpi:view' }),
        right({ id: 'r-2', name: 'kpi:edit' }),
        right({ id: 'r-3', name: 'reports:export', module: 'reports' }),
      ],
    });

    const selecting = page.selectRightEmployee(employee());
    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'GET' &&
          req.url.endsWith(
            'accesscontrol/directory/11111111-1111-1111-1111-111111111111/rights',
          ),
      )
      .flush({ success: true, data: [userRight({ permissionId: 'r-1', permissionName: 'kpi:view' })] });
    await selecting;

    page.toggleSelectAllRights(true);
    page.grantSelectedRights();

    expect(page.rightDialog()?.rights.map((row) => row.id)).toEqual(['r-2', 'r-3']);

    page.rightReason.set('Needs reporting access');
    const saving = page.confirmRightDecision();

    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'PUT' &&
          req.url.endsWith(
            'accesscontrol/directory/11111111-1111-1111-1111-111111111111/rights/r-2',
          ),
      )
      .flush({ success: true, data: userRight({ permissionId: 'r-2', permissionName: 'kpi:edit' }) });
    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'PUT' &&
          req.url.endsWith(
            'accesscontrol/directory/11111111-1111-1111-1111-111111111111/rights/r-3',
          ),
      )
      .flush({
        success: true,
        data: userRight({ permissionId: 'r-3', permissionName: 'reports:export', module: 'reports' }),
      });
    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'GET' &&
          req.url.endsWith(
            'accesscontrol/directory/11111111-1111-1111-1111-111111111111/rights',
          ),
      )
      .flush({
        success: true,
        data: [
          userRight({ permissionId: 'r-1', permissionName: 'kpi:view' }),
          userRight({ permissionId: 'r-2', permissionName: 'kpi:edit' }),
          userRight({ permissionId: 'r-3', permissionName: 'reports:export', module: 'reports' }),
        ],
      });
    await saving;

    expect(successSpy).toHaveBeenCalledWith('Granted 2 rights directly.');
    expect(page.rightDialog()).toBeNull();
    expect(page.selectedRightCount()).toBe(0);
    expect(page.userRights().map((row) => row.permissionId).sort()).toEqual(['r-1', 'r-2', 'r-3']);
    http.verify();
  });

  it('revokes only the selected rights that carry a direct assignment', async () => {
    const { http, notifications, confirmDialog, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    await flushInitial(http, {
      rights: [right({ id: 'r-1' }), right({ id: 'r-2', name: 'kpi:edit' })],
    });

    const selecting = page.selectRightEmployee(employee());
    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'GET' &&
          req.url.endsWith(
            'accesscontrol/directory/11111111-1111-1111-1111-111111111111/rights',
          ),
      )
      .flush({ success: true, data: [userRight({ permissionId: 'r-1', permissionName: 'kpi:view' })] });
    await selecting;

    expect(page.visibleRights().map((row) => row.id)).toEqual(['r-2']);

    page.setUserRightsMode('revoke');
    expect(page.visibleRights().map((row) => row.id)).toEqual(['r-1']);

    page.toggleSelectAllRights(true);
    const revoking = page.revokeSelectedRights();

    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'DELETE' &&
          req.url.endsWith(
            'accesscontrol/directory/11111111-1111-1111-1111-111111111111/rights/r-1',
          ),
      )
      .flush({ success: true, data: true });
    await nextTask();
    http
      .expectOne(
        (req) =>
          req.method === 'GET' &&
          req.url.endsWith(
            'accesscontrol/directory/11111111-1111-1111-1111-111111111111/rights',
          ),
      )
      .flush({ success: true, data: [] });
    await revoking;

    expect(successSpy).toHaveBeenCalledWith('Revoked 1 direct right.');
    expect(page.userRights()).toEqual([]);
    expect(page.selectedRightCount()).toBe(0);
    http.verify();
  });
});
