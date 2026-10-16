import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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
});
