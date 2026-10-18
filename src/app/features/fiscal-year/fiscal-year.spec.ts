import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CellValueChangedEvent } from 'ag-grid-community';
import { FiscalYearPage } from './fiscal-year';
import { FiscalYear } from './fiscal-year.model';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';

const ok = (data: unknown) => ({ success: true, message: 'ok', data });

const fiscalYear = (overrides: Partial<FiscalYear> = {}): FiscalYear => ({
  id: 'fy-1',
  label: 'FY 2026',
  startDate: '2026-07-01',
  // Far future while Open so the date-based rule keeps it editable.
  endDate: '2099-06-30',
  status: 'Open',
  hasScorecards: false,
  ...overrides,
});

describe('FiscalYearPage FR-703 gating', () => {
  let page: FiscalYearPage;
  let http: HttpTestingController;
  let notifications: NotificationService;
  let dialog: ConfirmDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    page = TestBed.runInInjectionContext(() => new FiscalYearPage());
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    dialog = TestBed.inject(ConfirmDialogService);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  const load = (rows: FiscalYear[]): void => {
    http.expectOne((r) => r.url.includes('/fiscalyear')).flush(ok(rows));
  };

  it('treats an open year with a future end date as editable', () => {
    load([fiscalYear()]);

    expect(page.isEditable(page.rows()[0])).toBe(true);
  });

  it('treats ended, closed and archived years as not editable', () => {
    load([
      fiscalYear({ id: 'ended', status: 'Open', endDate: '2000-06-30' }),
      fiscalYear({ id: 'closed', status: 'Closed', endDate: '2099-06-30' }),
      fiscalYear({ id: 'archived', status: 'Archived', endDate: '2099-06-30' }),
    ]);
    const byId = new Map(page.rows().map((row) => [row.id, row]));

    expect(page.isEditable(byId.get('ended'))).toBe(false);
    expect(page.isEditable(byId.get('closed'))).toBe(false);
    expect(page.isEditable(byId.get('archived'))).toBe(false);
  });

  it('disables inline cell editing for locked rows through the column callback', () => {
    load([
      fiscalYear({ id: 'open', status: 'Open', endDate: '2099-06-30' }),
      fiscalYear({ id: 'ended', status: 'Open', endDate: '2000-06-30' }),
    ]);
    const byId = new Map(page.rows().map((row) => [row.id, row]));
    const labelColumn = page.columnDefs.find((column) => column.field === 'label')!;
    const editable = labelColumn.editable as (params: { data: FiscalYear }) => boolean;

    expect(editable({ data: byId.get('open')! })).toBe(true);
    expect(editable({ data: byId.get('ended')! })).toBe(false);
  });

  it('disables start-date editing when the year already has scorecards', () => {
    load([
      fiscalYear({ id: 'movable', hasScorecards: false }),
      fiscalYear({ id: 'locked', hasScorecards: true }),
    ]);
    const byId = new Map(page.rows().map((row) => [row.id, row]));
    const startColumn = page.columnDefs.find((column) => column.field === 'startDate')!;
    const editable = startColumn.editable as (params: { data: FiscalYear }) => boolean;

    expect(editable({ data: byId.get('movable')! })).toBe(true);
    expect(editable({ data: byId.get('locked')! })).toBe(false);
  });

  it('never makes the end-date column editable', () => {
    load([fiscalYear()]);
    const endColumn = page.columnDefs.find((column) => column.field === 'endDate')!;

    expect(endColumn.editable).toBeFalsy();
  });

  it('does not open the edit form for a locked year and warns', () => {
    load([fiscalYear({ id: 'closed', status: 'Closed' })]);
    const warning = vi.spyOn(notifications, 'warning');

    page.onEdit(page.rows()[0]);

    expect(page.showForm()).toBe(false);
    expect(page.editingId()).toBeNull();
    expect(warning).toHaveBeenCalled();
  });

  it('opens the edit form for an editable year', () => {
    load([fiscalYear()]);

    page.onEdit(page.rows()[0]);

    expect(page.showForm()).toBe(true);
    expect(page.editingId()).toBe('fy-1');
  });

  it('blocks deletion of a locked year without prompting or calling the API', async () => {
    load([fiscalYear({ id: 'ended', status: 'Open', endDate: '2000-06-30' })]);
    const warning = vi.spyOn(notifications, 'warning');
    const confirm = vi.spyOn(dialog, 'confirm');

    await page.onDelete('ended');

    expect(confirm).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalled();
    http.expectNone((r) => r.method === 'DELETE');
  });

  it('treats an empty 204 response as a successful delete', async () => {
    load([fiscalYear()]);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    const success = vi.spyOn(notifications, 'success');

    const done = page.onDelete('fy-1');
    await Promise.resolve();
    await Promise.resolve();

    const request = http.expectOne((r) => r.method === 'DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await done;

    expect(success).toHaveBeenCalledWith('Fiscal year deleted.');
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/fiscalyear')).flush(ok([]));
  });

  it('surfaces the backend 409 message when a deletion is refused', async () => {
    load([fiscalYear()]);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    const error = vi.spyOn(notifications, 'error');

    const done = page.onDelete('fy-1');
    await Promise.resolve();
    await Promise.resolve();

    const request = http.expectOne((r) => r.method === 'DELETE');
    request.flush(
      { status: 409, title: 'Fiscal year FY 2026 still contains scorecards; it cannot be deleted.' },
      { status: 409, statusText: 'Conflict' }
    );
    await done;

    expect(error).toHaveBeenCalledWith(
      'Fiscal year FY 2026 still contains scorecards; it cannot be deleted.'
    );
  });

  it('calculates the end date as the last day of the twelfth month', () => {
    load([]);
    page.openAddModal();

    page.fiscalYearForm.controls.startMonth.setValue('2026-09');

    expect(page.fiscalYearEndDate()).toBe('2027-08-31');
  });

  it('calculates the end date across a leap February', () => {
    load([]);
    page.openAddModal();

    page.fiscalYearForm.controls.startMonth.setValue('2023-03');
    expect(page.fiscalYearEndDate()).toBe('2024-02-29');

    page.fiscalYearForm.controls.startMonth.setValue('2026-01');
    expect(page.fiscalYearEndDate()).toBe('2026-12-31');
  });

  it('submits the first day of the chosen month and the calculated end date', () => {
    load([]);
    page.openAddModal();
    page.fiscalYearForm.setValue({ label: 'FY 2026/27', startMonth: '2026-09' });

    page.onSubmit();

    const request = http.expectOne((r) => r.method === 'POST');
    expect(request.request.body.startDate).toBe('2026-09-01');
    expect(request.request.body.endDate).toBe('2027-08-31');
    request.flush(ok(fiscalYear()));

    // A successful create reloads the list; flush that follow-up request.
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/fiscalyear')).flush(ok([]));
  });

  it('reverts an inline start-date edit on a year that already has scorecards', () => {
    load([fiscalYear({ hasScorecards: true, startDate: '2026-07-01' })]);
    const warning = vi.spyOn(notifications, 'warning');
    const row = page.rows()[0];
    const event = {
      data: row,
      colDef: { field: 'startDate' },
      oldValue: '2026-07-01',
      newValue: '2026-09-01',
      node: {},
      api: { refreshCells: vi.fn() },
    } as unknown as CellValueChangedEvent<FiscalYear>;

    page.onCellValueChanged(event);

    expect(row.startDate).toBe('2026-07-01');
    expect(warning).toHaveBeenCalled();
    http.expectNone((r) => r.method === 'PUT');
  });

  it('persists an inline start-date edit without an end date and reloads', () => {
    load([fiscalYear({ startDate: '2026-07-01' })]);
    const row = page.rows()[0];
    const event = {
      data: row,
      colDef: { field: 'startDate' },
      oldValue: '2026-07-01',
      newValue: '2026-09-01',
      node: {},
      api: { refreshCells: vi.fn() },
    } as unknown as CellValueChangedEvent<FiscalYear>;

    page.onCellValueChanged(event);

    const request = http.expectOne((r) => r.method === 'PUT');
    expect(request.request.body.startDate).toBe('2026-09-01');
    expect(request.request.body.endDate).toBeUndefined();
    request.flush(ok(fiscalYear()));

    // A start-date change reloads so the server-derived end date is shown.
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/fiscalyear')).flush(ok([]));
  });

  it('updates a year without scorecards by sending only the label and start date', () => {
    load([fiscalYear({ id: 'fy-1', startDate: '2026-07-01' })]);
    page.onEdit(page.rows()[0]);
    page.fiscalYearForm.setValue({ label: 'FY 2026/27', startMonth: '2026-09' });

    page.onUpdate();

    const request = http.expectOne((r) => r.method === 'PUT');
    expect(request.request.body.label).toBe('FY 2026/27');
    expect(request.request.body.startDate).toBe('2026-09-01');
    expect(request.request.body.endDate).toBeUndefined();
    request.flush(ok(fiscalYear()));
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/fiscalyear')).flush(ok([]));
  });

  it('locks the dates but still relabels a year that has scorecards', () => {
    load([fiscalYear({ id: 'fy-1', hasScorecards: true })]);
    page.onEdit(page.rows()[0]);

    expect(page.datesLocked()).toBe(true);
    expect(page.fiscalYearForm.controls.startMonth.disabled).toBe(true);

    page.fiscalYearForm.setValue({ label: 'Renamed', startMonth: '2026-07' });
    page.onUpdate();

    const request = http.expectOne((r) => r.method === 'PUT');
    expect(request.request.body.label).toBe('Renamed');
    expect(request.request.body.startDate).toBeUndefined();
    request.flush(ok(fiscalYear()));
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/fiscalyear')).flush(ok([]));
  });

  it('renders the start and end dates with a numeric day and month letters', () => {
    load([]);
    const format = (field: string, value: string): string => {
      const column = page.columnDefs.find((c) => c.field === field)!;
      return (column.valueFormatter as (params: { value: unknown }) => string)({ value });
    };

    expect(format('startDate', '2026-06-01T00:00:00')).toBe('1 Jun 2026');
    expect(format('endDate', '2027-08-31T00:00:00')).toBe('31 Aug 2027');
  });
});
