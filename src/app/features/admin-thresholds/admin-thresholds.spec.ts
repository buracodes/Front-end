import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import type { AuthUser } from '../../core/model/auth.model';
import { RagThresholdConfiguration } from '../../core/model/rag-threshold.model';
import { AdminThresholdsPage } from './admin-thresholds';

function config(overrides: Partial<RagThresholdConfiguration> = {}): RagThresholdConfiguration {
  return {
    scopeKey: 'default',
    green: 95,
    yellow: 70,
    isConfigured: false,
    source: 'Defaults',
    greenColor: '#16A34A',
    yellowColor: '#D97706',
    redColor: '#DC2626',
    grayColor: '#6B7280',
    warnings: [],
    ...overrides,
  };
}

describe('AdminThresholdsPage', () => {
  function setup(): { http: HttpTestingController; notifications: NotificationService; page: AdminThresholdsPage } {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const http = TestBed.inject(HttpTestingController);
    const notifications = TestBed.inject(NotificationService);

    TestBed.inject(UserStore).setUser({
      id: 'u-1',
      username: 'thresholds-admin',
      fullName: 'Threshold Admin',
      roles: ['Admin'],
      permissions: ['admin:rag.thresholds.manage'],
    } satisfies Partial<AuthUser> as AuthUser);

    const page = TestBed.runInInjectionContext(() => new AdminThresholdsPage());
    return { http, notifications, page };
  }

  async function flushInitialGet(http: HttpTestingController, payload: RagThresholdConfiguration): Promise<void> {
    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'GET' && req.url.includes('ragthreshold'))
      .flush({ success: true, data: payload });
  }

  it('loads the effective thresholds on init and patches the form', async () => {
    const { http, page } = setup();

    await flushInitialGet(http, config({ green: 90, yellow: 60 }));

    expect(page.config()?.green).toBe(90);
    expect(page.form.controls.green.value).toBe(90);
    expect(page.form.controls.yellow.value).toBe(60);
    expect(page.sourceLabel()).toBe('FRD defaults');
  });

  it('blocks saves that do not follow the band rule and fires no request', async () => {
    const { http, notifications, page } = setup();
    const errorSpy = vi.spyOn(notifications, 'error');

    await flushInitialGet(http, config());

    page.form.setValue({ green: 60, yellow: 60 });
    await page.save();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('strictly below the Green band'));
    http.verify();
    expect(page.submitting()).toBe(false);
  });

  it('saves a valid pair, toasts success, and adopts the returned configuration', async () => {
    const { http, notifications, page } = setup();
    const successSpy = vi.spyOn(notifications, 'success');

    await flushInitialGet(http, config());

    page.form.setValue({ green: 90, yellow: 60 });
    const saving = page.save();

    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'PUT' && req.url.includes('ragthreshold'))
      .flush({
        success: true,
        data: config({ green: 90, yellow: 60, isConfigured: true, source: 'Database' }),
      });
    await saving;

    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('updated'));
    expect(page.config()?.source).toBe('Database');
    expect(page.sourceLabel()).toBe('Stored configuration');
    expect(page.submitting()).toBe(false);
  });

  it('surfaces API validation failures and keeps the entered values', async () => {
    const { http, notifications, page } = setup();
    const errorSpy = vi.spyOn(notifications, 'error');

    await flushInitialGet(http, config());

    page.form.setValue({ green: 90, yellow: 60 });
    const saving = page.save();

    await Promise.resolve();
    http
      .expectOne((req) => req.method === 'PUT' && req.url.includes('ragthreshold'))
      .flush(
        { message: 'Yellow threshold must be strictly lower than the Green threshold.' },
        { status: 400, statusText: 'Bad Request' },
      );
    await saving;

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('strictly lower'));
    expect(page.form.controls.green.value).toBe(90);
    expect(page.form.controls.yellow.value).toBe(60);
  });

  it('bands the preview from the entered thresholds', () => {
    const { http, page } = setup();

    page.form.setValue({ green: 90, yellow: 60 });

    const bands = page.preview().reduce((acc, row) => {
      acc.set(row.band, (acc.get(row.band) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    expect(bands.get('NoData')).toBe(1);
    expect(bands.get('Green')).toBe(3);
    expect(bands.get('Amber')).toBe(2);
    expect(bands.get('Red')).toBe(1);
  });
});
