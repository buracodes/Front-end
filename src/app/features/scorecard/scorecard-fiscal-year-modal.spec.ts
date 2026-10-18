import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ScorecardPage } from './scorecard';
import { ScorecardService } from './scorecard.service';
import { ScorecardService as CoreScorecardService } from '../../core/service/scorecard.service';
import { FiscalYearService } from '../fiscal-year/fiscal-year.service';
import { FiscalYear, CreateFiscalYearRequest } from '../fiscal-year/fiscal-year.model';
import { NotificationService } from '../../core/service/notification.service';

const fiscalYear = (overrides: Partial<FiscalYear> = {}): FiscalYear => ({
  id: 'fy-2027',
  label: 'FY 2027',
  startDate: '2027-01-01',
  endDate: '2027-12-31',
  status: 'Open',
  ...overrides,
});

describe('ScorecardPage Add Fiscal Year modal', () => {
  let page: ScorecardPage;
  let fiscalYearService: FiscalYearService;
  let coreScorecardService: CoreScorecardService;
  let notifications: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fiscalYearService = TestBed.inject(FiscalYearService);
    coreScorecardService = TestBed.inject(CoreScorecardService);
    notifications = TestBed.inject(NotificationService);
    vi.spyOn(notifications, 'success');
    vi.spyOn(notifications, 'error');
    page = TestBed.runInInjectionContext(() => new ScorecardPage());
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  /** Both lists load on init; serve them synchronously to keep tests focused. */
  const prime = (): void => {
    vi.spyOn(coreScorecardService, 'getFiscalYears').mockReturnValue(of([fiscalYear({ id: 'fy-existing', label: 'FY 2026' })]));
    vi.spyOn(TestBed.inject(ScorecardService), 'getAll').mockReturnValue(of([]));
    page.ngOnInit();
  };

  it('opens the modal with the shared fiscal-year form and resets it', () => {
    prime();

    page.openAddFiscalYearModal();
    page.fiscalYearForm.setValue({ label: 'FY 2027', startMonth: '2027-09' });
    page.showFiscalYearModal.set(false);

    page.openAddFiscalYearModal();

    expect(page.showFiscalYearModal()).toBe(true);
    expect(page.fiscalYearForm.controls.label.value).toBe('');
    expect(page.fiscalYearForm.controls.startMonth.value).toBe('');
    expect(page.fiscalYearEndDate()).toBe('');
  });

  it('sends the first day of the chosen month and the derived twelve-month end date to the existing API', () => {
    prime();
    const create = vi.spyOn(fiscalYearService, 'create').mockReturnValue(of(fiscalYear()));

    page.openAddFiscalYearModal();
    page.fiscalYearForm.setValue({ label: 'FY 2028', startMonth: '2028-09' });
    page.onSubmitFiscalYear();

    expect(create).toHaveBeenCalledTimes(1);
    const request: CreateFiscalYearRequest = create.mock.calls[0][0];
    expect(request.label).toBe('FY 2028');
    // The start is always the first day of a month and the end date spans exactly 12 months.
    expect(request.startDate).toBe('2028-09-01');
    expect(request.endDate).toBe('2029-08-31');
  });

  it('does not call the API when the form is invalid', () => {
    prime();
    const create = vi.spyOn(fiscalYearService, 'create').mockReturnValue(of(fiscalYear()));

    page.openAddFiscalYearModal();
    page.onSubmitFiscalYear();

    expect(create).not.toHaveBeenCalled();
    expect(page.fiscalYearSubmitting()).toBe(false);
    expect(page.showFiscalYearModal()).toBe(true);
  });

  it('surfaces duplicate/overlap backend messages and keeps the modal open', () => {
    prime();
    const create = vi.spyOn(fiscalYearService, 'create').mockReturnValue(
      throwError(() => new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: { title: 'A fiscal year already covers 2027-01-01 to 2027-12-31. Fiscal years cannot overlap.' },
      }))
    );

    page.openAddFiscalYearModal();
    page.fiscalYearForm.setValue({ label: 'FY 2027', startMonth: '2027-01' });
    page.onSubmitFiscalYear();

    expect(notifications.error).toHaveBeenCalledWith('A fiscal year already covers 2027-01-01 to 2027-12-31. Fiscal years cannot overlap.');
    expect(page.showFiscalYearModal()).toBe(true);
    expect(page.fiscalYearSubmitting()).toBe(false);
  });

  it('prevents duplicate submissions while a create is in flight', () => {
    prime();
    const pending = new Subject<FiscalYear>();
    const create = vi.spyOn(fiscalYearService, 'create').mockReturnValue(pending);

    page.openAddFiscalYearModal();
    page.fiscalYearForm.setValue({ label: 'FY 2028', startMonth: '2028-09' });
    page.onSubmitFiscalYear();
    page.onSubmitFiscalYear();

    // One submission only: the second click while in flight is a no-op.
    expect(create).toHaveBeenCalledTimes(1);
    expect(page.fiscalYearSubmitting()).toBe(true);

    pending.complete();
  });

  it('closes the modal, refreshes the fiscal-year list and opens Add Scorecard preselected on success', () => {
    prime();
    const create = vi.spyOn(fiscalYearService, 'create').mockReturnValue(of(fiscalYear({ id: 'fy-new' })));

    page.openAddFiscalYearModal();
    page.fiscalYearForm.setValue({ label: 'FY 2028', startMonth: '2028-09' });
    page.onSubmitFiscalYear();

    expect(notifications.success).toHaveBeenCalledWith('Fiscal year created.');
    expect(page.showFiscalYearModal()).toBe(false);
    expect(page.fiscalYearSubmitting()).toBe(false);
    expect(page.fiscalYearSubmitting()).toBe(false);
    // The fiscal-year list was refreshed...
    expect(coreScorecardService.getFiscalYears).toHaveBeenCalledTimes(2);
    // ...and the scorecard form is open, pre-selected to the newly created fiscal year.
    expect(page.showForm()).toBe(true);
    expect(page.editingId()).toBeNull();
    expect(page.form.controls.fiscalYearId.value).toBe('fy-new');
  });
});
