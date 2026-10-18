import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { GoalsPage, goalWeightValidator } from './goals';
import { NotificationService } from '../../core/service/notification.service';
import { Goal } from '../../core/model/goal.model';
import { Scorecard } from '../../core/model/scorecard.model';

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

describe('goalWeightValidator (FR-302 weight range)', () => {
  it('accepts weights strictly above 0 and at most 100', () => {
    expect(goalWeightValidator({ value: 0.01 } as never)).toBeNull();
    expect(goalWeightValidator({ value: 50 } as never)).toBeNull();
    expect(goalWeightValidator({ value: 100 } as never)).toBeNull();
  });

  it('rejects zero, negative, above-100 and empty values', () => {
    expect(goalWeightValidator({ value: 0 } as never)).toHaveProperty('min');
    expect(goalWeightValidator({ value: -3 } as never)).toHaveProperty('min');
    expect(goalWeightValidator({ value: 100.01 } as never)).toHaveProperty('max');
    expect(goalWeightValidator({ value: null } as never)).toHaveProperty('required');
  });
});

describe('GoalsPage weight budget', () => {
  let page: GoalsPage;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    page = TestBed.runInInjectionContext(() => new GoalsPage());
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  /** The constructor fires: fiscal years, two scorecard lists and the goal list. */
  const settle = (goals: Goal[] = []): void => {
    http.expectOne((r) => r.url === `${API}fiscalyear`).flush(ok([
      { id: 'fy-1', label: 'FY 2026', startDate: '2026-07-01', endDate: '2027-06-30', status: 'Open' },
    ]));
    // The constructor issues two scorecard GETs (plan-filter options + this page).
    http.match((r) => r.url === `${API}scorecard`).forEach((req) => req.flush(ok([scorecard()])));
    http.expectOne((r) => r.url === `${API}goal`).flush(ok(goals));
  };

  it('sums the assigned goal weights for the total display', () => {
    settle([goal(), goal({ id: 'g-2', name: 'Second', weight: 30 })]);

    expect(page.totalAssignedWeight()).toBe(70);
  });

  it('excludes the edited goal and other scorecards from the form total', () => {
    settle([
      goal(),
      goal({ id: 'g-2', name: 'Second', weight: 30 }),
      goal({ id: 'g-3', name: 'Other scorecard', weight: 999, scorecardId: 'sc-9' }),
    ]);

    page.openAddModal();
    page.form.controls.scorecardId.setValue('sc-1');
    expect(page.formScorecardWeightTotal()).toBe(70);

    page.onEdit(goal({ id: 'g-1', weight: 40 }));
    expect(page.formScorecardWeightTotal()).toBe(30);
  });

  it('keeps the form invalid while weight stays at the 0 default', () => {
    settle([]);

    page.form.controls.weight.setValue(50);
    expect(page.form.controls.weight.valid).toBe(true);

    page.form.controls.weight.setValue(0);
    expect(page.form.controls.weight.valid).toBe(false);

    page.form.controls.weight.setValue(101);
    expect(page.form.controls.weight.valid).toBe(false);
  });

  it('rejects out-of-range weights with an error toast and sends no save request', () => {
    settle([]);
    const notifications = TestBed.inject(NotificationService);

    page.form.controls.scorecardId.setValue('sc-1');
    page.form.controls.name.setValue('Bad weight');

    page.form.controls.weight.setValue(0);
    page.onSubmit();
    expect(notifications.toasts().some((t) => t.type === 'error' && t.message.includes('greater than 0'))).toBe(true);

    page.form.controls.weight.setValue(-10);
    page.onSubmit();
    expect(notifications.toasts().some((t) => t.type === 'error' && t.message.includes('greater than 0'))).toBe(true);

    page.form.controls.weight.setValue(150);
    page.onSubmit();
    expect(notifications.toasts().some((t) => t.type === 'error' && t.message.includes('exceed 100'))).toBe(true);

    // No create/update request must have been fired for any of the rejected values.
    http.verify();
  });
});
