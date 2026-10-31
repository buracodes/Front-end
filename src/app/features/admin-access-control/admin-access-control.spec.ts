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

  it('marks rights already assigned to the selected group', async () => {
    const { http, page } = setup();
    await flushInitial(http);

    const selecting = page.selectGroup(group());

    await Promise.resolve();
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

    expect(page.selectedGroupRights().get('r-1')).toBe('Grant');
    expect(page.groupRightModules()[0].rights[0].effect).toBe('Grant');
    http.verify();
  });

  it('builds the employee display name from HR first and middle names', async () => {
    const { http, page } = setup();
    await flushInitial(http);

    expect(page.employeeName(employee())).toBe('Dereje Kebede');
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
});
