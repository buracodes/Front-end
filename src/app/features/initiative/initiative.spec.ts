import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { InitiativePage } from './initiative';
import { InitiativeListItem } from './initiative.model';
import { UserStore } from '../../core/service/user-store.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { AuthUser } from '../../core/model/auth.model';

const ok = (data: unknown) => ({ success: true, message: 'ok', data });

/** Local yyyy-MM-dd for today plus the given day offset, so date assertions never go stale. */
const isoDay = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const SUMMARY = {
  totalInitiatives: 4,
  notStarted: 1,
  inProgress: 2,
  completed: 1,
  onHold: 0,
  cancelled: 0,
  closed: 1,
  averageProgressPercentage: 46,
  budgetUtilizationPercent: 88.5,
  totalPlannedBudget: 1000,
  totalActualExpenditure: 885,
  totalBudgetVariance: 115,
  overdueInitiatives: 1,
  upcomingMilestones: 3,
};

const row = (overrides: Partial<InitiativeListItem> = {}): InitiativeListItem => ({
  id: 'init-1',
  name: 'Digitise permitting',
  description: 'Replace paper permits with an online flow.',
  priority: 'High',
  status: 'InProgress',
  budget: 500,
  actualExpenditure: 420,
  ownerId: 'user-1',
  ownerName: 'Owner One',
  kraId: 'kra-1',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  createdDate: '2026-01-01T00:00:00Z',
  isClosed: false,
  milestoneCount: 2,
  progressPercentage: 62.5,
  progressRagStatus: 'Red',
  totalMilestoneWeight: 100,
  milestoneWeightsAreValid: true,
  budgetPosition: {
    isBudgetTracked: true,
    plannedBudget: 500,
    actualExpenditure: 420,
    budgetVariance: 80,
    budgetUtilizationPercent: 84,
    isOverBudget: false,
  },
  isOverdue: false,
  ...overrides,
});

const user = (permissions: string[]): AuthUser => ({
  id: 'user-1',
  username: 'owner',
  fullName: 'Owner One',
  email: 'owner@spms.local',
  roles: ['DataInputUser'],
  permissions,
});

describe('InitiativePage', () => {
  let http: HttpTestingController;
  let store: UserStore;

  const isGrid = (r: { urlWithParams: string }): boolean =>
    r.urlWithParams.includes('/api/initiative?');
  const isSummary = (r: { urlWithParams: string }): boolean =>
    r.urlWithParams.endsWith('/api/initiative/summary');

  /** Answers the option requests the grid fires on construction. */
  const flushOptions = (): void => {
    http.expectOne((r) => r.urlWithParams.endsWith('/api/user')).flush(ok([]));
    http.expectOne((r) => r.urlWithParams.endsWith('/api/goal')).flush(ok([]));
    http.expectOne((r) => r.urlWithParams.endsWith('/api/kra')).flush(ok([]));
    http.expectOne((r) => r.urlWithParams.endsWith('/api/kpi')).flush(ok([]));
  };

  /**
   * Answers the Goal → KRA → KPI option requests the form fires whenever it is opened, narrowed to
   * the given goal/kra when the edit form is preserving existing strategic links.
   */
  const flushCascade = (links?: { goalId?: string; kraId?: string }): void => {
    http.expectOne((r) => r.urlWithParams.endsWith('/api/goal')).flush(ok([]));
    http
      .expectOne((r) =>
        links?.goalId
          ? r.urlWithParams.endsWith(`/api/kra?goalId=${links.goalId}`)
          : r.urlWithParams.endsWith('/api/kra')
      )
      .flush(ok([]));
    http
      .expectOne((r) =>
        links?.kraId
          ? r.urlWithParams.endsWith(`/api/kpi?kraId=${links.kraId}`)
          : r.urlWithParams.endsWith('/api/kpi')
      )
      .flush(ok([]));
  };

  /** Answers the grid and summary with the supplied rows. */
  const flushGrid = (items: InitiativeListItem[], summary: unknown = SUMMARY): void => {
    http.expectOne(isGrid).flush(
      ok({ items, totalCount: items.length, page: 1, pageSize: 25, totalPages: 1 })
    );
    http.expectOne(isSummary).flush(ok(summary));
  };

  /** Configures the page with the given permissions and answers the initial requests. */
  const start = (permissions: string[] = [], items: InitiativeListItem[] = []): InitiativePage => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(permissions));
    http = TestBed.inject(HttpTestingController);

    const page = TestBed.runInInjectionContext(() => new InitiativePage());
    flushOptions();
    flushGrid(items);
    return page;
  };

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('loads the grid and summary from the API on load', () => {
    const page = start([], [row()]);

    expect(page.rows().map((r) => r.id)).toEqual(['init-1']);
    expect(page.totalCount()).toBe(1);
    expect(page.stats().total).toBe(4);
    expect(page.stats().overdue).toBe(1);
  });

  it('renders the backend progress and budget figures instead of recalculating them', () => {
    const page = start([], [row({ progressPercentage: 62.5 })]);

    expect(page.progressFor(page.rows()[0])).toBe(63);
    expect(page.budgetVariance(page.rows()[0])).toBe(80);
    expect(page.budgetUtilization(page.rows()[0])).toBe(84);
    expect(page.isOverBudget(page.rows()[0])).toBe(false);
    expect(page.weightsAreValid(page.rows()[0])).toBe(true);
  });

  it('paints the card progress bar with the band the backend reported', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user([]));
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(InitiativePage);
    fixture.detectChanges();
    flushOptions();
    flushGrid([
      row({ id: 'init-1', progressRagStatus: 'Green' }),
      row({ id: 'init-2', progressRagStatus: 'Amber' }),
      row({ id: 'init-3', progressRagStatus: 'Red' }),
      row({ id: 'init-4', progressRagStatus: 'NoData' }),
    ]);
    fixture.detectChanges();

    const fills = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '.initiative-progress .progress-fill'
    );
    expect([...fills].map((f) => f.className)).toEqual([
      'progress-fill rag-green',
      'progress-fill rag-amber',
      'progress-fill rag-red',
      'progress-fill rag-gray',
    ]);
  });

  it('exposes no variance or utilization when no budget is tracked', () => {
    const page = start([], [
      row({
        budget: 0,
        budgetPosition: {
          isBudgetTracked: false,
          plannedBudget: 0,
          actualExpenditure: 0,
          budgetVariance: null,
          budgetUtilizationPercent: null,
          isOverBudget: false,
        },
      }),
    ]);

    expect(page.budgetVariance(page.rows()[0])).toBeNull();
    expect(page.budgetUtilization(page.rows()[0])).toBeNull();
    expect(page.stats().budgetUtilization).toBe(88.5);
  });

  it('sends search, status, owner and closed filters to the server', () => {
    const page = start();

    page.onSearchChange('  permitting  ');
    let request = http.expectOne(isGrid);
    expect(request.request.urlWithParams).toContain('search=permitting');
    request.flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 }));

    page.onStatusFilterChange('InProgress');
    request = http.expectOne(isGrid);
    expect(request.request.urlWithParams).toContain('status=InProgress');
    request.flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 }));

    page.onOwnerFilterChange('user-9');
    request = http.expectOne(isGrid);
    expect(request.request.urlWithParams).toContain('ownerId=user-9');
    request.flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 }));

    page.onIncludeClosedChange(false);
    request = http.expectOne(isGrid);
    expect(request.request.urlWithParams).toContain('includeClosed=false');
    request.flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 }));
  });

  it('resets to the first page whenever a filter changes', () => {
    const page = start();

    page.onStatusFilterChange('OnHold');
    const first = http.expectOne(isGrid);
    expect(first.request.urlWithParams).toContain('page=1');
    first.flush(ok({ items: [], totalCount: 90, page: 1, pageSize: 25, totalPages: 4 }));
    expect(page.totalPages()).toBe(4);

    page.goToPage(3);
    const third = http.expectOne(isGrid);
    expect(third.request.urlWithParams).toContain('page=3');
    third.flush(ok({ items: [], totalCount: 90, page: 3, pageSize: 25, totalPages: 4 }));
    expect(page.page()).toBe(3);

    page.onOwnerFilterChange('user-2');
    const reset = http.expectOne(isGrid);
    expect(reset.request.urlWithParams).toContain('page=1');
    reset.flush(ok({ items: [], totalCount: 90, page: 1, pageSize: 25, totalPages: 4 }));
    expect(page.page()).toBe(1);
  });

  it('ignores paging requests outside the available range', () => {
    const page = start();

    page.goToPage(0);
    page.goToPage(9);
    http.expectNone(isGrid);
  });

  it('derives grid action permissions from the signed-in user', () => {
    const page = start(['initiatives:create', 'initiatives:edit']);

    expect(page.canCreate()).toBe(true);
    expect(page.canEdit()).toBe(true);
    expect(page.canDelete()).toBe(false);
    expect(page.canClose()).toBe(false);
  });

  it('grants no grid action permissions without the matching claims', () => {
    const page = start(['initiatives:view']);

    expect(page.canCreate()).toBe(false);
    expect(page.canEdit()).toBe(false);
    expect(page.canDelete()).toBe(false);
  });

  it('loads the full detail before opening the edit form', () => {
    const page = start(['initiatives:edit'], [row()]);

    page.onEdit(page.rows()[0]);
    const request = http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1'));
    request.flush(ok({ ...row(), resources: 'Two engineers' }));
    flushCascade({ kraId: 'kra-1' });

    expect(page.editingId()).toBe('init-1');
    expect(page.form.value.resources).toBe('Two engineers');
    expect(page.form.value.kraId).toBe('kra-1');
    expect(page.showForm()).toBe(true);
  });

  it('submits the strategic links as an authoritative snapshot when the form is saved', () => {
    const page = start(['initiatives:edit'], [row({ isClosed: false })]);
    page.onEdit(page.rows()[0]);
    http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1')).flush(
      ok(row({ kraId: 'kra-1' }))
    );
    flushCascade({ kraId: 'kra-1' });

    // Emptied selects mean "clear that link"; the other selects are sent unchanged. The form
    // opts into the snapshot via strategicLinksSpecified instead of the blanket clear flag.
    page.form.patchValue({ kraId: '', kpiId: '' });
    page.onUpdate();

    const request = http.expectOne(
      (r) => r.method === 'PUT' && r.urlWithParams.endsWith('/api/initiative/init-1')
    );
    expect(request.request.body.strategicLinksSpecified).toBe(true);
    expect(request.request.body.kraId).toBeUndefined();
    expect(request.request.body.kpiId).toBeUndefined();
    expect(request.request.body.clearStrategicLinks).toBeUndefined();
    request.flush(ok(row()));

    http.expectOne(isGrid).flush(
      ok({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 })
    );
  });

  it('shows the new initiative as a card after creating it', () => {
    const page = start(['initiatives:create']);

    // A search term, a status filter and a later page would all hide the new card,
    // so the create flow has to clear them before reloading.
    page.search.set('digitise');
    page.statusFilter.set('OnHold');
    page.goToPage(2);

    page.openAddModal();
    flushCascade();
    page.form.patchValue({
      name: 'New initiative',
      ownerId: 'user-1',
      startDate: isoDay(1),
      endDate: isoDay(40),
    });
    page.onSubmit();

    const created = http.expectOne((r) => r.method === 'POST' && r.urlWithParams.endsWith('/api/initiative'));
    expect(created.request.body.name).toBe('New initiative');
    created.flush(ok({ ...row(), id: 'init-9', name: 'New initiative' }));

    // Reloaded against a cleared filter on page 1, so the API returns the new card first.
    const reload = http.expectOne(isGrid);
    expect(reload.request.urlWithParams).not.toContain('search=');
    expect(reload.request.urlWithParams).not.toContain('status=');
    expect(reload.request.urlWithParams).toContain('page=1');
    reload.flush(
      ok({
        items: [row({ id: 'init-9', name: 'New initiative' })],
        totalCount: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      })
    );
    http.expectOne(isSummary).flush(ok(SUMMARY));

    expect(page.search()).toBe('');
    expect(page.statusFilter()).toBe('all');
    expect(page.page()).toBe(1);
    expect(page.rows().map((r) => r.name)).toEqual(['New initiative']);
    expect(page.showForm()).toBe(false);
  });

  it('requires the start and end dates before an initiative can be created', () => {
    const page = start(['initiatives:create']);

    page.openAddModal();
    flushCascade();
    page.form.patchValue({ name: 'New initiative', ownerId: 'user-1' });

    // Both dates are part of the plan, so the create form is invalid until they are set.
    expect(page.form.invalid).toBe(true);
    expect(page.form.controls.startDate.hasError('required')).toBe(true);
    expect(page.form.controls.endDate.hasError('required')).toBe(true);

    page.onSubmit();
    http.expectNone((r) => r.method === 'POST' && r.urlWithParams.endsWith('/api/initiative'));

    page.form.patchValue({ startDate: isoDay(1), endDate: isoDay(40) });
    expect(page.form.invalid).toBe(false);
  });

  it('rejects a backdated start date when creating', () => {
    const page = start(['initiatives:create']);

    page.openAddModal();
    flushCascade();
    page.form.patchValue({
      name: 'New initiative',
      ownerId: 'user-1',
      startDate: isoDay(-1),
      endDate: isoDay(30),
    });

    expect(page.form.controls.startDate.hasError('pastStartDate')).toBe(true);
    expect(page.form.invalid).toBe(true);

    page.onSubmit();
    http.expectNone((r) => r.method === 'POST' && r.urlWithParams.endsWith('/api/initiative'));
  });

  it('allows today as a start date when creating', () => {
    const page = start(['initiatives:create']);

    page.openAddModal();
    flushCascade();
    page.form.patchValue({
      name: 'New initiative',
      ownerId: 'user-1',
      startDate: isoDay(0),
      endDate: isoDay(30),
    });

    expect(page.form.controls.startDate.hasError('pastStartDate')).toBe(false);
    expect(page.form.valid).toBe(true);
  });

  it('keeps an overdue initiative editable without re-applying the no-backdating rule to its start date', () => {
    const page = start(['initiatives:edit'], [row()]);

    page.onEdit(page.rows()[0]);
    http
      .expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1'))
      .flush(ok(row({ startDate: isoDay(-30), endDate: isoDay(30) })));
    flushCascade({ kraId: 'kra-1' });

    expect(page.form.controls.startDate.hasError('pastStartDate')).toBe(false);
    expect(page.form.valid).toBe(true);

    page.onUpdate();
    const request = http.expectOne(
      (r) => r.method === 'PUT' && r.urlWithParams.endsWith('/api/initiative/init-1')
    );
    request.flush(ok(row()));

    http.expectOne(isGrid).flush(
      ok({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 })
    );
  });

  it('flags a start date moved into the past while editing', () => {
    const page = start(['initiatives:edit'], [row()]);

    page.onEdit(page.rows()[0]);
    http
      .expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1'))
      .flush(ok(row({ startDate: isoDay(10), endDate: isoDay(60) })));
    flushCascade({ kraId: 'kra-1' });

    page.form.patchValue({ startDate: isoDay(-1) });

    expect(page.form.controls.startDate.hasError('pastStartDate')).toBe(true);
    expect(page.form.invalid).toBe(true);

    page.onUpdate();
    http.expectNone((r) => r.method === 'PUT');
  });

  it('reports a load failure without leaving stale rows behind', () => {
    const page = start([], [row()]);

    page.loadInitiatives();
    http.expectOne(isGrid).flush({ success: false, message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(page.rows()).toEqual([]);
    expect(page.loadError()).toBeTruthy();
  });

  it('renders no status field while creating or editing (lifecycle is a dedicated action)', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(['initiatives:create', 'initiatives:edit']));
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(InitiativePage);
    fixture.detectChanges();
    flushOptions();
    flushGrid([row()]);
    fixture.detectChanges();

    const statusSelect = (): HTMLSelectElement | null =>
      fixture.nativeElement.querySelector('[formControlName="status"]') as HTMLSelectElement | null;

    // Creating: status is not editable (defaults to Not Started server-side).
    fixture.componentInstance.openAddModal();
    fixture.detectChanges();
    expect(statusSelect()).toBeNull();
    flushCascade();
    fixture.detectChanges();

    // Editing: status moved to the detail page's lifecycle actions, so the form has no status field.
    fixture.componentInstance.onEdit(fixture.componentInstance.rows()[0]);
    fixture.detectChanges();
    http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1')).flush(ok(row()));
    fixture.detectChanges();
    flushCascade({ kraId: 'kra-1' });
    fixture.detectChanges();
    expect(statusSelect()).toBeNull();
  });

  it('presents a delete as a delete and never claims it is irreversible', async () => {
    const page = start(['initiatives:delete'], [row({ isClosed: false })]);
    const dialog = TestBed.inject(ConfirmDialogService);

    const pending = page.onDelete('init-1');

    // The server only hides the initiative, so the prompt must not promise a permanent removal.
    expect(dialog.state().title).toBe('Delete Initiative');
    expect(dialog.state().confirmText).toBe('Delete');
    expect(dialog.state().message).not.toContain('cannot be undone');

    dialog.onConfirm();
    await pending;

    const request = http.expectOne(
      (r) => r.method === 'DELETE' && r.urlWithParams.endsWith('/api/initiative/init-1')
    );
    request.flush(ok(null));

    http.expectOne(isGrid).flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 }));
    http.expectOne(isSummary).flush(ok(SUMMARY));
  });

  it('renders Lucide icons instead of pseudo-glyph characters for system actions', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(['initiatives:create', 'initiatives:edit']));
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(InitiativePage);
    fixture.detectChanges();
    flushOptions();
    flushGrid([row()]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    // The header create action is a Lucide plus glyph, not a "+" character.
    expect(host.querySelector('svg.lucide-plus')).not.toBeNull();

    // Opening a modal renders its close affordance as a Lucide x glyph.
    fixture.componentInstance.openAddModal();
    fixture.detectChanges();
    flushCascade();
    fixture.detectChanges();
    expect(host.querySelector('svg.lucide-x')).not.toBeNull();

    // No pseudo-icon characters survive anywhere on the page.
    expect(host.textContent).not.toContain('\u00d7');
    expect(host.textContent).not.toContain('\u22ee');
  });
});