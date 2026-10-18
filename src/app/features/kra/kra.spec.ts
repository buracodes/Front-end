import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { KraPage, kraWeightValidator } from './kra';
import { NotificationService } from '../../core/service/notification.service';
import { Kra } from './kra.model';
import { Scorecard } from '../../core/model/scorecard.model';
import { Goal } from '../../core/model/goal.model';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';

const API = 'https://localhost:5211/api/';
const ok = (data: unknown) => ({ success: true, message: 'ok', data });

const scorecard = (overrides: Partial<Scorecard> = {}): Scorecard => ({
  id: 'sc-1',
  fiscalYearId: 'fy-1',
  fiscalYearName: 'FY 2026',
  name: 'Corporate 2026',
  scope: 'Corporate',
  scorecardStatus: 'Active',
  ...overrides,
});

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g-1',
  scorecardId: 'sc-1',
  name: 'Grow revenue',
  weight: 40,
  ...overrides,
});

const kra = (overrides: Partial<Kra> = {}): Kra => ({
  id: 'k-1',
  goalId: 'g-1',
  scorecardId: 'sc-1',
  name: 'Grow revenue',
  weight: 40,
  isActive: true,
  kpiCount: 0,
  ...overrides,
});

describe('kraWeightValidator (FR-302 weight range)', () => {
  it('accepts weights strictly above 0 and at most 100', () => {
    expect(kraWeightValidator({ value: 0.01 } as never)).toBeNull();
    expect(kraWeightValidator({ value: 50 } as never)).toBeNull();
    expect(kraWeightValidator({ value: 100 } as never)).toBeNull();
  });

  it('rejects zero, negative, above-100 and empty values', () => {
    expect(kraWeightValidator({ value: 0 } as never)).toHaveProperty('min');
    expect(kraWeightValidator({ value: -3 } as never)).toHaveProperty('min');
    expect(kraWeightValidator({ value: 100.01 } as never)).toHaveProperty('max');
    expect(kraWeightValidator({ value: null } as never)).toHaveProperty('required');
  });
});

describe('KraPage weight budget', () => {
  let page: KraPage;
  let http: HttpTestingController;
  let notifications: NotificationService;
  let dialog: { confirm: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dialog = { confirm: vi.fn(() => Promise.resolve(false)) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ConfirmDialogService, useValue: dialog },
      ],
    });
    page = TestBed.runInInjectionContext(() => new KraPage());
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  /** The constructor fires: fiscal years, three scorecard lists, org profile themes and the KRA list. */
  const settle = (kras: Kra[] = []): void => {
    http.expectOne((r) => r.url === `${API}fiscalyear`).flush(ok([
      { id: 'fy-1', label: 'FY 2026', startDate: '2026-07-01', endDate: '2027-06-30', status: 'Open' },
    ]));
    http.match((r) => r.url === `${API}scorecard`).forEach((req) => req.flush(ok([scorecard()])));
    http.expectOne((r) => r.url === `${API}organization`).flush(ok({
      id: 'org-1',
      name: 'ECX',
      vision: 'v',
      mission: 'm',
      coreValues: [],
      strategicThemes: [
        { id: 'theme-1', title: 'Digitalization', code: 'T1' },
      ],
      swotItems: [],
      pestelItems: [],
    }));
    http.expectOne((r) => r.url === `${API}kra`).flush(ok(kras));
  };

  const goalsForScorecard = (): void => {
    http.expectOne((r) => r.url === `${API}goal?scorecardId=sc-1`).flush(ok([goal()]));
  };

  it('sums the assigned KRA weights for the total display', () => {
    settle([kra(), kra({ id: 'k-2', name: 'Second', weight: 30 })]);

    expect(page.totalAssignedWeight()).toBe(70);
  });

  it('sums only the KRAs of the selected goal, excluding the edited one', () => {
    settle([
      kra(),
      kra({ id: 'k-2', name: 'Second', weight: 30 }),
      kra({ id: 'k-3', name: 'Other goal', weight: 999, goalId: 'g-9' }),
    ]);

    page.openAddModal();
    page.form.controls.goalId.setValue('g-1');
    expect(page.formKraBudgetTotal()).toBe(70);

    page.onEdit(kra({ id: 'k-1', weight: 40 }));
    goalsForScorecard();
    expect(page.formKraBudgetTotal()).toBe(30);
  });

  it('initializes the create form and keeps API failures with the entered values', () => {
    settle([]);
    page.openAddModal();

    page.form.controls.scorecardId.setValue('sc-1');
    page.form.controls.goalId.setValue('g-1');
    page.form.controls.name.setValue('Inbound logistics');
    page.form.controls.weight.setValue(40);
    page.onSubmit();
    // create endpoint posts but responds with a validation failure
    http.expectOne((r) => r.method === 'POST' && r.url === `${API}kra`).flush(
      { title: 'KRA weight must be greater than 0.', status: 400 },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(notifications.toasts().some((t) => t.type === 'error' && t.message.includes('greater than 0'))).toBe(true);
    expect(page.showForm()).toBe(true);
    expect(page.form.controls.name.value).toBe('Inbound logistics');
    expect(page.form.controls.weight.value).toBe(40);
  });

  it('rejects out-of-range weights with an error toast and sends no save request', () => {
    settle();
    page.openAddModal();

    page.form.controls.weight.setValue(0);
    page.onSubmit();
    expect(notifications.toasts().some((t) => t.type === 'error' && t.message.includes('greater than 0'))).toBe(true);

    page.form.controls.weight.setValue(150);
    page.onSubmit();
    expect(notifications.toasts().some((t) => t.type === 'error' && t.message.includes('exceed 100'))).toBe(true);

    http.verify();
  });

  it('describes the deletion restriction based on the KRA KPI count', async () => {
    settle([kra({ id: 'k-1', kpiCount: 2 }), kra({ id: 'k-2', name: 'Empty', kpiCount: 0 })]);

    await page.onDelete('k-1');
    const blockedMessage = String(dialog.confirm.mock.calls[0]?.[1] ?? '');
    expect(blockedMessage).toContain('KPIs');
    expect(blockedMessage).toContain('cannot be deleted');

    await page.onDelete('k-2');
    const allowedMessage = String(dialog.confirm.mock.calls[1]?.[1] ?? '');
    expect(allowedMessage).not.toContain('KPIs');
    // Both attempts were confirmed by the fake dialog (it resolves to false, so
    // no delete request is actually issued in either case).
    expect(dialog.confirm).toHaveBeenCalledTimes(2);
  });

  it('keeps the edit form invalid while weight stays at the 0 default', () => {
    settle([kra()]);
    page.onEdit(kra());
    goalsForScorecard();

    expect(page.form.controls.weight.valid).toBe(true);

    page.form.controls.weight.setValue(0);
    expect(page.form.controls.weight.valid).toBe(false);

    page.form.controls.weight.setValue(101);
    expect(page.form.controls.weight.valid).toBe(false);
  });
});
