import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AuthUser } from '../../core/model/auth.model';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { AccessGroup, AccessSummary } from './admin-access-control.model';
import { AdminAccessControlPage } from './admin-access-control';

const PAGE_PERMISSION = 'admin:access.view';

function summary(overrides: Partial<AccessSummary> = {}): AccessSummary {
  return {
    totalGroups: 4,
    totalRights: 30,
    groupMembershipAssignments: 12,
    directGrantAssignments: 3,
    directDenyAssignments: 1,
    ...overrides,
  };
}

function group(overrides: Partial<AccessGroup> = {}): AccessGroup {
  return {
    id: 'g-1',
    name: 'Coordinators',
    description: null,
    memberCount: 2,
    rightCount: 4,
    denyCount: 1,
    isActive: true,
    status: 'Active',
    lastUpdated: '2026-10-18T09:00:00Z',
    ...overrides,
  };
}

describe('AdminAccessControlPage', () => {
  function setup(permissions: string[] = [PAGE_PERMISSION, 'admin:access.groups.manage', 'admin:access.rights.manage', 'admin:access.user-rights.manage', 'admin:audit.view']): {
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

  async function flushSummary(http: HttpTestingController, payload: AccessSummary = summary()): Promise<void> {
    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/summary'))
      .flush({ success: true, data: payload });
  }

  it('renders the page tab as visible for viewers with admin:access.view', async () => {
    const { http, page } = setup([PAGE_PERMISSION]);
    await flushSummary(http);

    expect(page.visibleTabs().map((t) => t.key)).toContain('overview');
    expect(page.visibleTabs().map((t) => t.key)).not.toContain('audit');
    http.verify();
  });

  it('shows the Authorization Audit tab only for holders of admin:audit.view', async () => {
    const { http, page } = setup([PAGE_PERMISSION, 'admin:audit.view']);
    await flushSummary(http);

    expect(page.visibleTabs().map((t) => t.key)).toContain('audit');
    http.verify();
  });

  it('loads the summary on init and populates the overview cards', async () => {
    const { http, page } = setup();
    await flushSummary(http, summary({ totalGroups: 7 }));

    expect(page.summary()?.totalGroups).toBe(7);
    expect(page.summary()?.totalRights).toBe(30);
    http.verify();
  });

  it('refuses to create a group without a name and fires no request', async () => {
    const { http, notifications, page } = setup();
    const errorSpy = vi.spyOn(notifications, 'error');
    await flushSummary(http);

    await page.createGroup();

    expect(errorSpy).toHaveBeenCalledWith('Group name is required.');
    http.verify();
  });

  it('creates a group through the groups endpoint and reloads the list', async () => {
    const { http, notifications, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');
    await flushSummary(http);

    page.newGroupName.set('Coordinators');
    const saving = page.createGroup();

    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'POST' && req.url.includes('accesscontrol/groups'))
      .flush({ success: true, data: group() });
    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/groups'))
      .flush({ success: true, data: [group()] });
    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('accesscontrol/summary'))
      .flush({ success: true, data: summary() });
    await saving;

    expect(successSpy).toHaveBeenCalledWith('Access group created.');
    expect(page.newGroupName()).toBe('');
  });

  it('refuses to save a direct user right without a justification reason', async () => {
    const { http, notifications, page } = setup();
    const errorSpy = vi.spyOn(notifications, 'error');
    await flushSummary(http);
    http.verify();

    await page.saveUserRight();

    expect(errorSpy).toHaveBeenCalledWith('Select an employee and a right first.');
    http.verify();
  });

  it('labels granted and denied results with distinct tones', async () => {
    const { http, page } = setup();
    await flushSummary(http);

    expect(page.resultTone('Granted')).toBe('granted');
    expect(page.resultTone('Denied')).toBe('denied');
    http.verify();
  });

  it('counts granted rights in the effective-access overview', async () => {
    const { http, page } = setup();
    await flushSummary(http);

    const entries = [
      { result: 'Granted' },
      { result: 'Granted' },
      { result: 'Denied' },
    ] as never[];

    expect(page.grantedCount(entries)).toBe(2);
    http.verify();
  });

  it('blocks deleting a right that is still referenced', async () => {
    const { http, notifications, page } = setup();
    const errorSpy = vi.spyOn(notifications, 'error');
    await flushSummary(http);
    http.verify();

    await page.deleteRight({ referenced: true } as never);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('still referenced'));
    http.verify();
  });

  it('refuses membership assignment when employee or group is missing', async () => {
    const { http, notifications, page } = setup();
    const errorSpy = vi.spyOn(notifications, 'error');
    await flushSummary(http);
    http.verify();

    await page.assignMembership();

    expect(errorSpy).toHaveBeenCalledWith('Select an employee and an access group first.');
    http.verify();
  });
});
