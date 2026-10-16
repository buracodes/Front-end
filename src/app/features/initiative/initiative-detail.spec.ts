import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { InitiativeDetailPage, historyToCsv } from './initiative-detail';
import { Initiative, Milestone } from './initiative.model';
import { UserStore } from '../../core/service/user-store.service';
import { AuthUser } from '../../core/model/auth.model';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { NotificationService } from '../../core/service/notification.service';
import { provideAppIcons } from '../../core/icon/app-icons';

const ok = (data: unknown) => ({ success: true, message: 'ok', data });

const milestone = (overrides: Partial<Milestone> = {}): Milestone => ({
  id: 'ms-1',
  name: 'Phase 1',
  description: undefined,
  completionPercentage: 50,
  dueDate: '2026-06-30T00:00:00Z',
  weight: 60,
  status: 'InProgress',
  comments: 'Halfway there.',
  contributionPercentage: 30,
  updatedDate: undefined,
  ...overrides,
});

const initiative = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'init-1',
  name: 'Digitise permitting',
  description: 'Replace paper permits.',
  ownerId: 'user-1',
  ownerName: 'Owner One',
  priority: 'High',
  status: 'InProgress',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  budget: 500,
  actualExpenditure: 420,
  isClosed: false,
  progressPercentage: 30,
  progressRagStatus: 'Red',
  isReadyForCompletion: false,
  notReadyReason: null,
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
  milestones: [milestone()],
  dependencies: [],
  ...overrides,
});

const closed = (overrides: Partial<Initiative> = {}): Initiative =>
  initiative({
    isClosed: true,
    status: 'Completed',
    progressPercentage: 100,
    actualEndDate: '2026-10-30',
    outcomeSummary: 'Delivered on time.',
    lessonsLearned: 'Lock the vendor earlier.',
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

describe('InitiativeDetailPage', () => {
  let http: HttpTestingController;
  let store: UserStore;

  const isDetail = (r: { urlWithParams: string }): boolean =>
    r.urlWithParams.endsWith('/api/initiative/init-1');
  const isMilestones = (r: { urlWithParams: string }): boolean =>
    r.urlWithParams.endsWith('/api/initiative/init-1/milestones');
  const isHistory = (r: { urlWithParams: string }): boolean =>
    r.urlWithParams.endsWith('/api/initiative/init-1/history');
  const isCandidates = (r: { urlWithParams: string }): boolean =>
    r.urlWithParams.includes('/api/initiative?') && r.urlWithParams.includes('pageSize=200');

  /** Configures the page and answers every request the initial load fires. */
  const start = (
    permissions: string[],
    entity: Initiative = initiative(),
    rows: Initiative[] = [entity]
  ): InitiativeDetailPage => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'init-1' }) } },
        },
      ],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(permissions));
    http = TestBed.inject(HttpTestingController);

    const page = TestBed.runInInjectionContext(() => new InitiativeDetailPage());
    http.expectOne((r) => r.urlWithParams.endsWith('/api/user')).flush(ok([]));
    http.expectOne(isDetail).flush(ok(entity));
    http.expectOne(isMilestones).flush(ok(entity.milestones));
    http.expectOne(isHistory).flush(ok([]));
    http.expectOne(isCandidates).flush(
      ok({ items: rows, totalCount: rows.length, page: 1, pageSize: 200, totalPages: 1 })
    );
    return page;
  };

  /** Answers the reload the page fires after a milestone is written. */
  const settle = (entity: Initiative = initiative()): void => {
    http.expectOne(isDetail).flush(ok(entity));
    http.expectOne(isMilestones).flush(ok(entity.milestones));
    http.expectOne(isHistory).flush(ok([]));
  };

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('reads the detail, milestones, history and dependency candidates from the API', () => {
    const page = start(['initiatives:view']);

    expect(page.initiative()?.name).toBe('Digitise permitting');
    expect(page.milestones().map((m) => m.id)).toEqual(['ms-1']);
    expect(page.loading()).toBe(false);
    expect(page.loadError()).toBeNull();
  });

  it('normalises the camelCase milestone statuses the API sends so the badge renders', () => {
    // The API serialises enums as camelCase (JsonStringEnumConverter with the CamelCase naming
    // policy), so a milestone the backend recorded as InProgress arrives as `inProgress`. Without
    // normalisation the milestoneStatusLabel switch falls through to "Not started" even though the
    // backend really persisted InProgress.
    const page = start(
      ['initiatives:view'],
      initiative({
        milestones: [{ ...milestone(), status: 'inProgress' as unknown as Milestone['status'] }],
      })
    );

    const m = page.milestones()[0];
    expect(m.status).toBe('InProgress');
    expect(page.milestoneStatusLabel(m.status)).toBe('In progress');
  });

  it('counts the remaining weight down as the input changes and flags overspend', () => {
    const entity = initiative({
      milestones: [milestone({ id: 'ms-1', weight: 60 }), milestone({ id: 'ms-2', weight: 25 })],
    });

    // `start` builds the page with `new` so it never renders a template, so this case
    // drives a real fixture to assert on the hint the user actually reads.
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'init-1' }) } },
        },
      ],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(['initiatives:milestones.manage']));
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(InitiativeDetailPage);
    const page = fixture.componentInstance;
    http.expectOne((r) => r.urlWithParams.endsWith('/api/user')).flush(ok([]));
    http.expectOne(isDetail).flush(ok(entity));
    http.expectOne(isMilestones).flush(ok(entity.milestones));
    http.expectOne(isHistory).flush(ok([]));
    http.expectOne(isCandidates).flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 200, totalPages: 1 }));
    fixture.detectChanges();

    page.openMilestoneModal();
    fixture.detectChanges();

    const weightInput: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[formcontrolname="weight"]'
    );
    const group = weightInput.closest('.form-group') as HTMLElement;
    const hintEl = (): HTMLElement => group.querySelector('.form-hint') as HTMLElement;
    const hint = (): string => hintEl().textContent?.trim() ?? '';
    const type = (value: string): void => {
      weightInput.value = value;
      weightInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    // 85% is already committed across ms-1 and ms-2, so 15% is left before typing.
    expect(hint()).toBe('Remaining: 15%');
    expect(hintEl().classList.contains('form-hint--over')).toBe(false);

    // The hint counts down as the value is entered.
    type('5');
    expect(hint()).toBe('Remaining: 10%');

    // The hint keeps counting down with each keystroke.
    type('10');
    expect(hint()).toBe('Remaining: 5%');

    // Landing on the whole remaining budget reports nothing left and stays muted.
    type('15');
    expect(hint()).toBe('Remaining: 0%');
    expect(hintEl().classList.contains('form-hint--over')).toBe(false);

    // Overshooting flips the hint to the danger state and names the excess.
    type('25');
    expect(hint()).toBe('Over by 10% — weights must total exactly 100%');
    expect(hintEl().classList.contains('form-hint--over')).toBe(true);

    // Fractional overspend is reported precisely rather than rounded away.
    type('20.5');
    expect(hint()).toBe('Over by 5.5% — weights must total exactly 100%');

    // Recovering from the overspend clears the danger state.
    type('0');
    expect(hint()).toBe('Remaining: 15%');
    expect(hintEl().classList.contains('form-hint--over')).toBe(false);
  });

  it('renders the backend progress instead of deriving it from the milestones', () => {
    const page = start(['initiatives:view'], initiative({ progressPercentage: 42 }));

    expect(page.progress()).toBe(42);
  });

  it('paints the progress bar with the band the backend reported', () => {
    // The FRD bands are Green >= 95%, Amber 70-94.9%, Red < 70%, and the frontend only paints
    // whatever the backend decided, so the thresholds are never restated here.
    const green = start(['initiatives:view'], initiative({ progressPercentage: 96, progressRagStatus: 'Green' }));
    expect(green.progressRag()).toBe('Green');
    expect(green.progressRagClass()).toBe('rag-green');
    expect(green.progressRagLabel()).toBe('On track');

    TestBed.resetTestingModule();
    const amber = start(['initiatives:view'], initiative({ progressPercentage: 80, progressRagStatus: 'Amber' }));
    expect(amber.progressRagClass()).toBe('rag-amber');
    expect(amber.progressRagLabel()).toBe('At risk');

    TestBed.resetTestingModule();
    // "Amber" is the FRD's yellow band; the paint class follows the token name.
    expect(start(['initiatives:view']).progressRagClass()).toBe('rag-red');

    TestBed.resetTestingModule();
    // An initiative with no milestones has no progress to band, so it stays neutral.
    const noData = start(['initiatives:view'], initiative({ progressPercentage: 0, progressRagStatus: 'NoData' }));
    expect(noData.progressRagClass()).toBe('rag-gray');
    expect(noData.progressRagLabel()).toBe('No data');
  });

  it('drives the completion slider and reports the dragged value live', () => {
    const page = start(['initiatives:progress.update']);
    page.openProgressModal(page.milestones()[0]);

    // The slider opens on the milestone's stored completion.
    expect(page.progressCompletion()).toBe(50);

    // Dragging updates the form and the visible readout without saving.
    page.progressForm.controls.completionPercentage.setValue(75);
    expect(page.progressCompletion()).toBe(75);

    // Reaching the end of the range is a normal value, not a validation failure.
    page.progressForm.controls.completionPercentage.setValue(100);
    expect(page.progressCompletion()).toBe(100);
    expect(page.progressForm.controls.completionPercentage.valid).toBe(true);
  });

  it('saves the completion dragged on the slider and adopts the new RAG band', () => {
    const page = start(['initiatives:progress.update']);
    page.openProgressModal(page.milestones()[0]);
    page.progressForm.patchValue({ completionPercentage: 100 });
    page.onSubmitProgress();

    const request = http.expectOne((r) =>
      r.urlWithParams.endsWith('/api/initiative/init-1/milestones/ms-1/progress')
    );
    expect(request.request.body.completionPercentage).toBe(100);
    request.flush(
      ok(
        initiative({
          progressPercentage: 100,
          progressRagStatus: 'Green',
          milestones: [milestone({ completionPercentage: 100 })],
        })
      )
    );

    // The band comes back with the recalculated figure, so the bar recolours without a reload.
    expect(page.progress()).toBe(100);
    expect(page.progressRagClass()).toBe('rag-green');

    http.expectOne(isDetail).flush(ok(initiative()));
    http.expectOne(isMilestones).flush(ok([]));
    http.expectOne(isHistory).flush(ok([]));
  });

  it('reports closure eligibility from the backend readiness flag', () => {
    expect(start(['initiatives:close']).canCloseNow()).toBe(false);

    TestBed.resetTestingModule();
    expect(
      start(['initiatives:close'], initiative({ isReadyForCompletion: true }))
    ).toBeDefined();
    expect(
      start(['initiatives:close'], initiative({ isReadyForCompletion: true })).canCloseNow()
    ).toBe(true);

    TestBed.resetTestingModule();
    expect(
      start(['initiatives:close'], initiative({ isReadyForCompletion: false, notReadyReason: 'Weights must total 100%' })).canCloseNow()
    ).toBe(false);
  });

  it('lets the assigned owner confirm completion without the close permission, but not a stranger', () => {
    // Mirrors InitiativeGuard.EnsureCanClose: the owner or a power user may close, and the close
    // endpoint is gated on view so this allowance is actually reachable.
    const owner = start(['initiatives:view'], initiative({ isReadyForCompletion: true }));
    expect(owner.canConfirmCompletion()).toBe(true);
    expect(owner.canCloseNow()).toBe(true);

    const stranger = start(
      ['initiatives:view'],
      initiative({ ownerId: 'user-2', isReadyForCompletion: true })
    );
    expect(stranger.canConfirmCompletion()).toBe(false);
  });

  it('reports the remaining milestone weight against the 100% budget', () => {
    const twoMilestones = initiative({
      milestones: [milestone({ id: 'ms-1', weight: 60 }), milestone({ id: 'ms-2', weight: 25 })],
    });
    const page = start(['initiatives:milestones.manage'], twoMilestones);

    // Adding a third milestone: 85% is already committed, so 15% is left.
    expect(page.milestoneWeightRemaining()).toBe(15);
    expect(page.isMilestoneWeightOverspent()).toBe(false);

    // The figure counts the entered value down as the form changes.
    page.milestoneForm.patchValue({ weight: 5 });
    expect(page.milestoneWeightRemaining()).toBe(10);
    page.milestoneForm.patchValue({ weight: 15 });
    expect(page.milestoneWeightRemaining()).toBe(0);
    expect(page.isMilestoneWeightOverspent()).toBe(false);

    // Editing ms-1 must not count its own 60% against the budget, leaving only ms-2's 25%.
    page.onMilestoneEdit(twoMilestones.milestones[0]);
    expect(page.milestoneWeightRemaining()).toBe(15);
    page.milestoneForm.patchValue({ weight: 60 });
    expect(page.milestoneWeightRemaining()).toBe(15);
    page.milestoneForm.patchValue({ weight: 80 });
    expect(page.isMilestoneWeightOverspent()).toBe(true);

    TestBed.resetTestingModule();
    // Over-committed existing weights report a negative budget rather than a silent zero.
    const over = start(
      ['initiatives:milestones.manage'],
      initiative({ milestones: [milestone({ id: 'ms-1', weight: 70 }), milestone({ id: 'ms-2', weight: 50 })] })
    );
    expect(over.milestoneWeightRemaining()).toBe(-20);
    expect(over.isMilestoneWeightOverspent()).toBe(true);

    TestBed.resetTestingModule();
    // A milestone with no other siblings has the full budget available.
    const solo = start(
      ['initiatives:milestones.manage'],
      initiative({ milestones: [milestone({ id: 'ms-1', weight: 0 })] })
    );
    expect(solo.milestoneWeightRemaining()).toBe(100);
    solo.milestoneForm.patchValue({ weight: 100 });
    expect(solo.milestoneWeightRemaining()).toBe(0);
    expect(solo.isMilestoneWeightOverspent()).toBe(false);
  });

  it('rounds fractional weights so float drift never shows in the remaining budget', () => {
    const page = start(
      ['initiatives:milestones.manage'],
      initiative({
        milestones: [
          milestone({ id: 'ms-1', weight: 33.33 }),
          milestone({ id: 'ms-2', weight: 33.33 }),
          milestone({ id: 'ms-3', weight: 33.34 }),
        ],
      })
    );

    // 33.33 + 33.33 + 33.34 is exactly 100, so nothing remains to allocate.
    expect(page.milestoneWeightRemaining()).toBe(0);
  });

  it('refuses a weightless milestone once the weight budget is fully allocated', () => {
    // ms-1 and ms-2 already hold the whole 100% budget, so there is no share left to give.
    const entity = initiative({
      milestones: [milestone({ id: 'ms-1', weight: 60 }), milestone({ id: 'ms-2', weight: 40 })],
    });
    const page = start(['initiatives:milestones.manage'], entity);
    const isPost = (r: { urlWithParams: string; method: string }): boolean =>
      r.method === 'POST' && isMilestones(r);

    page.openMilestoneModal();
    page.milestoneForm.patchValue({ name: 'Phase 3', dueDate: '2026-06-30', weight: 0 });

    // A 0% milestone would never contribute to progress, so it is blocked rather than merely warned.
    expect(page.milestoneForm.controls.weight.hasError('milestoneWeightBudgetFullyAllocated')).toBe(true);
    expect(page.milestoneForm.invalid).toBe(true);
    page.onSubmitMilestone();
    expect(http.match(isPost)).toEqual([]);

    // The budget is full, not overspent, so the remaining countdown reads zero rather than negative.
    expect(page.isMilestoneWeightOverspent()).toBe(false);
    expect(page.milestoneWeightRemaining()).toBe(0);

    // Freeing weight on an existing milestone is what makes room for the new one.
    page.onMilestoneEdit(entity.milestones[0]);
    page.milestoneForm.patchValue({ weight: 50 });
    expect(page.milestoneForm.controls.weight.hasError('milestoneWeightBudgetFullyAllocated')).toBe(false);
    expect(page.milestoneWeightRemaining()).toBe(10);

    TestBed.resetTestingModule();
    // While the plan still has room, a placeholder at 0% is legitimate, so it is left alone.
    const room = start(
      ['initiatives:milestones.manage'],
      initiative({ milestones: [milestone({ id: 'ms-1', weight: 60 })] })
    );
    room.openMilestoneModal();
    room.milestoneForm.patchValue({ name: 'Phase 2', dueDate: '2026-06-30', weight: 0 });
    expect(room.milestoneForm.controls.weight.hasError('milestoneWeightBudgetFullyAllocated')).toBe(false);
    expect(room.milestoneForm.valid).toBe(true);
  });

  it('blocks saving a milestone that would take the weight total past 100%', () => {
    const entity = initiative({
      milestones: [milestone({ id: 'ms-1', weight: 60 }), milestone({ id: 'ms-2', weight: 25 })],
    });
    const page = start(['initiatives:milestones.manage'], entity);
    const isPost = (r: { urlWithParams: string; method: string }): boolean =>
      r.method === 'POST' && isMilestones(r);

    page.openMilestoneModal();
    // 85% is committed across ms-1 and ms-2, so 15% is what the new milestone may use.
    page.milestoneForm.patchValue({ name: 'Phase 3', dueDate: '2026-06-30', weight: 15 });
    expect(page.milestoneForm.valid).toBe(true);

    page.milestoneForm.patchValue({ weight: 16 });
    expect(page.isMilestoneWeightOverspent()).toBe(true);
    expect(page.milestoneForm.controls.weight.hasError('milestoneWeightOverBudget')).toBe(true);
    expect(page.milestoneForm.invalid).toBe(true);

    page.onSubmitMilestone();
    expect(http.match(isPost)).toEqual([]);

    // Lowering it back inside the budget clears the error and the save goes through.
    page.milestoneForm.patchValue({ weight: 15 });
    expect(page.isMilestoneWeightOverspent()).toBe(false);
    expect(page.milestoneForm.valid).toBe(true);

    page.onSubmitMilestone();
    const posted = http.expectOne(isPost);
    expect(posted.request.body.weight).toBe(15);
    posted.flush(ok(milestone({ id: 'ms-3', weight: 15 })));

    // A successful save refreshes the page.
    settle(entity);
  });

  it('marks the weight control touched so an over-budget save explains itself', () => {
    const page = start(
      ['initiatives:milestones.manage'],
      initiative({ milestones: [milestone({ id: 'ms-1', weight: 100 })] })
    );

    page.openMilestoneModal();
    page.milestoneForm.patchValue({ name: 'Phase 2', dueDate: '2026-06-30', weight: 5 });
    expect(page.milestoneForm.controls.weight.touched).toBe(false);

    page.onSubmitMilestone();
    expect(page.milestoneForm.controls.weight.touched).toBe(true);
    expect(page.milestoneForm.controls.weight.hasError('milestoneWeightOverBudget')).toBe(true);
    expect(http.match((r) => r.method === 'POST' && isMilestones(r))).toEqual([]);
  });

  it('still allows an edit on a plan that is already over 100% when the weight is unchanged', () => {
    const entity = initiative({
      milestones: [milestone({ id: 'ms-1', weight: 70 }), milestone({ id: 'ms-2', weight: 50 })],
    });
    const page = start(['initiatives:milestones.manage'], entity);
    const isPut = (r: { urlWithParams: string; method: string }): boolean =>
      r.method === 'PUT' && /\/api\/initiative\/init-1\/milestones\/ms-\d$/.test(r.urlWithParams);

    // The countdown still reports the overspend, so the state is not hidden from the user.
    page.onMilestoneEdit(entity.milestones[1]);
    expect(page.isMilestoneWeightOverspent()).toBe(true);

    // Saving 50% again changes nothing, so it must not be blocked, otherwise legacy over-budget
    // initiatives could never be edited. The backend allows this for the same reason.
    page.milestoneForm.patchValue({ completionPercentage: 25 });
    expect(page.milestoneForm.valid).toBe(true);
    page.onSubmitMilestone();
    http.expectOne(isPut).flush(ok(entity.milestones[1]));
    settle(entity);

    // Raising it past what the siblings leave is refused.
    page.onMilestoneEdit(entity.milestones[1]);
    page.milestoneForm.patchValue({ weight: 40 });
    expect(page.isMilestoneWeightOverspent()).toBe(true);
    expect(page.milestoneForm.controls.weight.hasError('milestoneWeightOverBudget')).toBe(true);
    page.onSubmitMilestone();
    expect(http.match(isPut)).toEqual([]);

    // Dropping it to 30% brings the plan back to exactly 100%.
    page.milestoneForm.patchValue({ weight: 30 });
    expect(page.isMilestoneWeightOverspent()).toBe(false);
    page.onSubmitMilestone();
    const put = http.expectOne(isPut);
    expect(put.request.body.weight).toBe(30);
    put.flush(ok(entity.milestones[1]));
    settle(entity);
  });

  it('locks a closed initiative for users without correction rights', () => {
    const page = start(['initiatives:view'], closed());

    expect(page.isReadOnly()).toBe(true);
  });

  it('keeps a closed initiative editable for users holding the edit permission', () => {
    const page = start(['initiatives:edit'], closed());

    expect(page.isReadOnly()).toBe(false);
  });

  it('hides milestone and dependency controls from a non-owner without the permissions', () => {
    const page = start(['initiatives:view'], initiative({ ownerId: 'user-9' }));

    expect(page.canManageMilestones()).toBe(false);
    expect(page.canUpdateProgress()).toBe(false);
    expect(page.canManageDependencies()).toBe(false);
    expect(page.canClose()).toBe(false);
  });

  it('shows milestone controls to the owner without an explicit permission', () => {
    // InitiativeGuard.EnsureCanManageMilestones accepts the initiative owner, so hiding the
    // button on the permission alone left owners unable to add milestones the API would accept.
    const page = start(['initiatives:view']);

    expect(page.isOwner()).toBe(true);
    expect(page.canManageMilestones()).toBe(true);
    expect(page.canManageDependencies()).toBe(true);
  });

  it('mirrors the guard for the owner on progress and expenditure, but never on details', () => {
    // The owner is authorised for progress and spend, not for the initiative detail fields that
    // `initiatives:edit` - and therefore canEdit() - protects.
    const page = start(['initiatives:view']);

    expect(page.canUpdateProgress()).toBe(true);
    expect(page.canUpdateExpenditure()).toBe(true);
    expect(page.canEdit()).toBe(false);
  });

  it('keeps the spend editor off a non-owner who holds only view', () => {
    const page = start(['initiatives:view'], initiative({ ownerId: 'user-9' }));

    expect(page.canUpdateExpenditure()).toBe(false);
  });

  it('keeps the spend editor hidden on a closed initiative even for its owner', () => {
    // Ownership authorisation is not enough on a locked initiative: the FR-405 lock is preserved
    // and the backend refuses the write even if the button were somehow reached.
    const page = start(['initiatives:view'], closed());

    expect(page.canUpdateExpenditure()).toBe(true);
    expect(page.isReadOnly()).toBe(true);
  });

  it('saves actual expenditure through the narrow expenditure endpoint', () => {
    const page = start(['initiatives:view']);
    page.openExpenditure();
    page.expenditureForm.setValue({ actualExpenditure: 610 });
    page.saveExpenditure();

    const request = http.expectOne((r) =>
      r.urlWithParams.endsWith('/api/initiative/init-1/expenditure')
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ actualExpenditure: 610 });
    request.flush(ok(initiative({ actualExpenditure: 610, progressPercentage: 30 })));
    http.expectOne(isHistory).flush(ok([]));

    expect(page.initiative()?.actualExpenditure).toBe(610);
    expect(page.editingExpenditure()).toBe(false);
  });

  it('hides the update-spend editor when no planned budget is configured', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAppIcons(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'init-1' }) } },
        },
      ],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(['initiatives:view']));
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(InitiativeDetailPage);
    const page = fixture.componentInstance;
    http.expectOne((r) => r.urlWithParams.endsWith('/api/user')).flush(ok([]));
    http
      .expectOne(isDetail)
      .flush(
        ok(
          initiative({
            budgetPosition: {
              isBudgetTracked: false,
              plannedBudget: 0,
              actualExpenditure: 0,
              budgetVariance: null,
              budgetUtilizationPercent: null,
              isOverBudget: false,
            },
          })
        )
      );
    http.expectOne(isMilestones).flush(ok([milestone()]));
    http.expectOne(isHistory).flush(ok([]));
    http
      .expectOne(isCandidates)
      .flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 200, totalPages: 1 }));
    fixture.detectChanges();

    page.setTab('budget');
    fixture.detectChanges();

    // FR-404: without a planned budget there is nothing to mix spend against, so the owner cannot
    // open the spend editor at all instead of writing a number the dashboard would ignore.
    const host = fixture.nativeElement as HTMLElement;
    const buttons = [...host.querySelectorAll<HTMLElement>('button')].map((b) => b.textContent?.trim());
    expect(buttons).not.toContain('Update spend');
  });

  it('warns in a toast when the milestone form is blocked, naming the offending field', () => {
    const page = start(
      ['initiatives:milestones.manage'],
      initiative({ startDate: '2026-01-01', endDate: '2026-10-12' })
    );
    const toasts = () => TestBed.inject(NotificationService).toasts();

    // An out-of-window due date is refused, and the user is told which rule they hit rather than
    // meeting a disabled Save button with no explanation.
    page.openMilestoneModal();
    page.milestoneForm.patchValue({ name: 'Late', dueDate: '2026-11-30' });
    page.onSubmitMilestone();

    expect(page.milestoneForm.controls.dueDate.touched).toBe(true);
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].type).toBe('warning');
    expect(toasts()[0].message).toContain('after the initiative end date');
    expect(toasts()[0].message).toContain('12 Oct 2026');
    expect(http.match((r) => r.method === 'POST')).toEqual([]);

    // Before the start date names the other bound.
    toasts().forEach((toast) => TestBed.inject(NotificationService).dismiss(toast.id));
    page.milestoneForm.patchValue({ dueDate: '2025-06-01' });
    page.onSubmitMilestone();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].message).toContain('before the initiative start date');

    // A missing name is reported too, so the user is never left guessing which field is at fault.
    toasts().forEach((toast) => TestBed.inject(NotificationService).dismiss(toast.id));
    page.milestoneForm.patchValue({ name: '', dueDate: '2026-06-30' });
    page.onSubmitMilestone();
    expect(toasts()[0].message).toContain('Milestone name is required');

    // Fixing every field clears the reason and lets the save through.
    toasts().forEach((toast) => TestBed.inject(NotificationService).dismiss(toast.id));
    page.milestoneForm.patchValue({ name: 'Phase 2', dueDate: '2026-06-30', weight: 20 });
    expect(page.milestoneBlockingReason()).toBeNull();
    page.onSubmitMilestone();

    const posted = http.expectOne(
      (r) => r.method === 'POST' && r.urlWithParams.endsWith('/api/initiative/init-1/milestones')
    );
    expect(posted.request.body.dueDate).toBe('2026-06-30');
    posted.flush(ok(milestone({ id: 'ms-2' })));
    settle(initiative());
  });

  it('warns when the weight budget cannot fit the milestone being saved', () => {
    const entity = initiative({
      milestones: [milestone({ id: 'ms-1', weight: 60 }), milestone({ id: 'ms-2', weight: 40 })],
    });
    const page = start(['initiatives:milestones.manage'], entity);
    const toasts = () => TestBed.inject(NotificationService).toasts();

    // The budget is fully allocated, so a 0% milestone would never contribute to progress.
    page.openMilestoneModal();
    page.milestoneForm.patchValue({ name: 'Phase 3', dueDate: '2026-06-30', weight: 0 });
    page.onSubmitMilestone();

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].message).toContain('never contribute to initiative progress');
    expect(http.match((r) => r.method === 'POST')).toEqual([]);

    // Overshooting names the exact overage so the user knows how far to come back. ms-1 and ms-2
    // already hold 100%, so a 25% milestone overshoots by the full 25%.
    toasts().forEach((toast) => TestBed.inject(NotificationService).dismiss(toast.id));
    page.milestoneForm.patchValue({ weight: 25 });
    page.onSubmitMilestone();
    expect(toasts()[0].message).toContain('over 100%');
    expect(toasts()[0].message).toContain('Lower it by 25%');
  });

  it('rejects a milestone due date outside the initiative window before calling the API', () => {
    const page = start(
      ['initiatives:milestones.manage'],
      initiative({ startDate: '2026-01-01', endDate: '2026-10-12' })
    );

    expect(page.milestoneDueDateMin()).toBe('2026-01-01');
    expect(page.milestoneDueDateMax()).toBe('2026-10-12');

    // After the end date.
    page.milestoneForm.patchValue({ name: 'Late', dueDate: '2026-11-30' });
    expect(page.milestoneForm.controls.dueDate.hasError('milestoneDueDateAfterEnd')).toBe(true);
    expect(page.milestoneForm.invalid).toBe(true);

    // Before the start date.
    page.milestoneForm.patchValue({ dueDate: '2025-06-01' });
    expect(page.milestoneForm.controls.dueDate.hasError('milestoneDueDateBeforeStart')).toBe(true);

    page.onSubmitMilestone();
    http.expectNone((r) => r.method === 'POST');

    // Both boundaries are inclusive, matching InitiativeGuard.ValidateMilestoneDueDate.
    page.milestoneForm.patchValue({ dueDate: '2026-10-12' });
    expect(page.milestoneForm.controls.dueDate.valid).toBe(true);

    page.onSubmitMilestone();
    const request = http.expectOne(
      (r) => r.method === 'POST' && r.urlWithParams.endsWith('/api/initiative/init-1/milestones')
    );
    expect(request.request.body.dueDate).toBe('2026-10-12');
    request.flush(ok(milestone()));
    http.expectOne(isDetail).flush(ok(initiative({ startDate: '2026-01-01', endDate: '2026-10-12' })));
    http.expectOne(isMilestones).flush(ok([milestone()]));
    http.expectOne(isHistory).flush(ok([]));
  });

  it('records milestone progress and adopts the recalculated initiative', () => {
    const page = start(['initiatives:progress.update']);
    page.openProgressModal(page.milestones()[0]);
    page.onSubmitProgress();

    const request = http.expectOne((r) =>
      r.urlWithParams.endsWith('/api/initiative/init-1/milestones/ms-1/progress')
    );
    expect(request.request.body).toEqual({
      completionPercentage: 50,
      status: 'InProgress',
      comments: 'Halfway there.',
    });
    request.flush(
      ok(initiative({ progressPercentage: 45, milestones: [milestone({ completionPercentage: 75 })] }))
    );

    expect(page.progress()).toBe(45);
    expect(page.progressTarget()).toBeNull();

    http.expectOne(isDetail).flush(ok(initiative()));
    http.expectOne(isMilestones).flush(ok([]));
    http.expectOne(isHistory).flush(ok([]));
  });

  it('submits the closure record and shows the initiative as closed', () => {
    const page = start(['initiatives:close'], initiative({ progressPercentage: 100 }));
    page.openCloseModal();
    page.closeForm.setValue({
      actualEndDate: '2026-10-05',
      finalActualExpenditure: 455,
      outcomeSummary: 'Delivered on time.',
      lessonsLearned: 'Lock the vendor earlier.',
    });
    page.submitClose();

    const request = http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1/close'));
    expect(request.request.body).toEqual({
      actualEndDate: '2026-10-05',
      finalActualExpenditure: 455,
      outcomeSummary: 'Delivered on time.',
      lessonsLearned: 'Lock the vendor earlier.',
    });
    request.flush(ok(closed()));
    http.expectOne(isHistory).flush(ok([]));

    expect(page.initiative()?.isClosed).toBe(true);
  });

  it('pre-fills the closure form with today as the actual end date', () => {
    const page = start(['initiatives:close'], initiative({ progressPercentage: 100 }));
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    page.openCloseModal();

    expect(page.showCloseForm()).toBe(true);
    expect(page.closeForm.controls.actualEndDate.value).toBe(today);
    expect(page.closeForm.controls.actualEndDate.valid).toBe(true);
  });

  it('rejects an actual end date in the future when closing', () => {
    const page = start(['initiatives:close'], initiative({ progressPercentage: 100 }));
    page.openCloseModal();
    page.closeForm.controls.actualEndDate.setValue('2026-12-31');

    expect(page.closeForm.controls.actualEndDate.hasError('futureDate')).toBe(true);
    expect(page.closeForm.invalid).toBe(true);

    page.submitClose();
    http.expectNone((r) => r.urlWithParams.endsWith('/api/initiative/init-1/close'));
  });

  it('rejects an actual end date earlier than the initiative start date when closing', () => {
    const page = start(['initiatives:close'], initiative({ progressPercentage: 100 }));
    page.openCloseModal();
    page.closeForm.controls.actualEndDate.setValue('2025-12-31');

    expect(page.closeForm.controls.actualEndDate.hasError('beforeStart')).toBe(true);
    expect(page.closeForm.invalid).toBe(true);
  });

  it('rejects an actual end date on the start date because the initiative must last at least one day', () => {
    const page = start(['initiatives:close'], initiative({ progressPercentage: 100 }));
    page.openCloseModal();
    page.closeForm.controls.actualEndDate.setValue('2026-01-01');

    expect(page.closeForm.controls.actualEndDate.hasError('beforeStart')).toBe(true);
    expect(page.closeForm.invalid).toBe(true);
  });

  it('rejects an actual end date after the planned end date when closing', () => {
    const page = start(
      ['initiatives:close'],
      initiative({ progressPercentage: 100, startDate: '2025-01-01', endDate: '2025-06-30' }),
    );
    page.openCloseModal();
    page.closeForm.controls.actualEndDate.setValue('2025-07-15');

    expect(page.closeForm.controls.actualEndDate.hasError('afterPlannedEnd')).toBe(true);
    expect(page.closeForm.invalid).toBe(true);

    page.submitClose();
    http.expectNone((r) => r.urlWithParams.endsWith('/api/initiative/init-1/close'));
  });

  it('accepts an actual end date on the planned end date because the window is inclusive', () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const page = start(['initiatives:close'], initiative({ progressPercentage: 100, endDate: today }));
    page.openCloseModal();
    page.closeForm.controls.actualEndDate.setValue(today);

    expect(page.closeForm.controls.actualEndDate.hasError('afterPlannedEnd')).toBe(false);
    expect(page.closeForm.controls.actualEndDate.valid).toBe(true);
  });

  it('pre-fills the overdue closure form with the planned end date so the default is valid', () => {
    const page = start(
      ['initiatives:close'],
      initiative({ progressPercentage: 100, startDate: '2025-01-01', endDate: '2025-06-30' }),
    );
    page.openCloseModal();

    expect(page.closeForm.controls.actualEndDate.value).toBe('2025-06-30');
    expect(page.closeForm.controls.actualEndDate.valid).toBe(true);
  });

  it('bounds the closure date picker to the day after start and the planned end date', () => {
    const page = start(
      ['initiatives:close'],
      initiative({ progressPercentage: 100, startDate: '2025-01-01', endDate: '2025-06-30' }),
    );

    expect(page.closeActualEndDateMin()).toBe('2025-01-02');
    expect(page.closeActualEndDateMax()).toBe('2025-06-30');
  });

  it('reopens a closed initiative with a recorded reason', () => {
    const page = start(['initiatives:close'], closed());
    page.openReopenModal();
    page.reopenForm.setValue({ reason: 'Wrong spend recorded' });
    page.submitReopen();

    const request = http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1/reopen'));
    expect(request.request.body).toEqual({ reason: 'Wrong spend recorded' });
    request.flush(ok(initiative()));
    http.expectOne(isHistory).flush(ok([]));

    expect(page.initiative()?.isClosed).toBe(false);
  });

  it('refuses to reopen without a recorded reason', () => {
    const page = start(['initiatives:close'], closed());
    page.openReopenModal();

    expect(page.reopenForm.controls.reason.hasError('required')).toBe(true);
    expect(page.reopenForm.invalid).toBe(true);

    page.submitReopen();
    http.expectNone((r) => r.urlWithParams.endsWith('/api/initiative/init-1/reopen'));
  });

  it('puts an initiative on hold only with a recorded reason', () => {
    const page = start(['initiatives:edit']);
    page.openHoldModal();

    expect(page.showHoldForm()).toBe(true);
    expect(page.holdForm.controls.reason.hasError('required')).toBe(true);

    // An empty reason is blocked before any request is sent.
    page.submitHold();
    http.expectNone((r) => r.urlWithParams.endsWith('/api/initiative/init-1/hold'));

    page.holdForm.patchValue({ reason: 'Waiting on funding approval' });
    expect(page.holdForm.valid).toBe(true);
    page.submitHold();

    const request = http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1/hold'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Waiting on funding approval' });
    request.flush(ok(initiative({ status: 'OnHold' })));
    http.expectOne(isHistory).flush(ok([]));

    expect(page.initiative()?.status).toBe('OnHold');
    expect(page.showHoldForm()).toBe(false);
  });

  it('resumes an initiative without requiring a reason', () => {
    const page = start(['initiatives:edit'], initiative({ status: 'OnHold' }));
    page.resumeInitiative();

    const request = http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1/resume'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush(ok(initiative({ status: 'InProgress' })));
    http.expectOne(isHistory).flush(ok([]));

    expect(page.initiative()?.status).toBe('InProgress');
  });

  it('cancels an initiative only with a recorded reason', () => {
    const page = start(['initiatives:close'], initiative({ progressPercentage: 100 }));
    page.openCancelModal();

    expect(page.showCancelForm()).toBe(true);
    expect(page.cancelForm.controls.reason.hasError('required')).toBe(true);

    page.submitCancel();
    http.expectNone((r) => r.urlWithParams.endsWith('/api/initiative/init-1/cancel'));

    page.cancelForm.patchValue({ reason: 'Scope dropped by management' });
    page.submitCancel();

    const request = http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1/cancel'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Scope dropped by management' });
    request.flush(ok(initiative({ status: 'Cancelled' })));
    http.expectOne(isHistory).flush(ok([]));

    expect(page.initiative()?.status).toBe('Cancelled');
    expect(page.showCancelForm()).toBe(false);
  });

  it('gates lifecycle actions on the edit/close permissions and ownership', () => {
    // An assigned owner manages hold/resume but cannot cancel directly (open decision).
    const owner = start(['initiatives:view'], initiative({ ownerId: 'user-1' }));
    expect(owner.canManageLifecycle()).toBe(true);
    expect(owner.canCancelInitiative()).toBe(false);

    // A stranger with only view cannot touch the lifecycle at all.
    const stranger = start(['initiatives:view'], initiative({ ownerId: 'user-9' }));
    expect(stranger.canManageLifecycle()).toBe(false);
    expect(stranger.canCancelInitiative()).toBe(false);

    // A close holder manages everything, including cancellation.
    const closer = start(['initiatives:close']);
    expect(closer.canManageLifecycle()).toBe(true);
    expect(closer.canCancelInitiative()).toBe(true);
  });

  it('labels the lifecycle history entries readably', () => {
    const page = start(['initiatives:view']);
    expect(page.historyTypeLabel('InitiativeHeld')).toBe('Initiative put on hold');
    expect(page.historyTypeLabel('InitiativeResumed')).toBe('Initiative resumed');
    expect(page.historyTypeLabel('InitiativeCancelled')).toBe('Initiative cancelled');
  });

  it('offers only unused initiatives as prerequisites', () => {
    const other = initiative({ id: 'init-2', name: 'Land registry upgrade' });
    const third = initiative({ id: 'init-3', name: 'Fee automation' });
    const page = start(['initiatives:dependencies.manage'], initiative(), [other, third]);
    page.initiative.set(
      initiative({
        dependencies: [
          { initiativeId: 'init-1', dependsOnInitiativeId: 'init-3', dependsOnInitiativeName: 'Fee automation' },
        ],
      })
    );

    expect(page.availableDependencies().map((c) => c.id)).toEqual(['init-2']);
  });

  it('adds a dependency returned by the API', () => {
    const page = start(['initiatives:dependencies.manage']);
    page.selectedDependencyId.set('init-2');
    page.onAddDependency();

    const request = http.expectOne((r) => r.urlWithParams.endsWith('/api/initiative/init-1/dependencies'));
    expect(request.request.body).toEqual({ dependsOnInitiativeId: 'init-2' });
    request.flush(
      ok(initiative({ dependencies: [{ initiativeId: 'init-1', dependsOnInitiativeId: 'init-2' }] }))
    );

    expect(page.initiative()?.dependencies).toHaveLength(1);
    expect(page.selectedDependencyId()).toBe('');
  });

  it('removes a prerequisite', () => {
    const page = start(
      ['initiatives:dependencies.manage'],
      initiative({
        dependencies: [{ initiativeId: 'init-1', dependsOnInitiativeId: 'init-2' }],
      })
    );

    page.onRemoveDependency('init-2');

    const request = http.expectOne(
      (r) => r.method === 'DELETE' && r.urlWithParams.endsWith('/api/initiative/init-1/dependencies/init-2')
    );
    request.flush(ok(initiative()));

    expect(page.initiative()?.dependencies).toHaveLength(0);
  });

  it('deletes a milestone and refreshes the initiative', async () => {
    const page = start(['initiatives:milestones.manage']);
    const dialog = TestBed.inject(ConfirmDialogService);

    const pending = page.onMilestoneDelete('ms-1');

    // A delete only hides the milestone row, so the prompt must not claim it is irreversible.
    expect(dialog.state().title).toBe('Delete Milestone');
    expect(dialog.state().confirmText).toBe('Delete');
    expect(dialog.state().message).not.toContain('cannot be undone');

    dialog.onConfirm();
    await pending;

    http.expectOne((r) => r.method === 'DELETE' && r.urlWithParams.endsWith('/api/initiative/init-1/milestones/ms-1')).flush(ok(null));
    http.expectOne(isDetail).flush(ok(initiative({ milestones: [] })));
    http.expectOne(isMilestones).flush(ok([]));
    http.expectOne(isHistory).flush(ok([]));

    expect(page.milestones()).toEqual([]);
  });

  it('leaves the milestone alone when the confirmation is dismissed', async () => {
    const page = start(['initiatives:milestones.manage']);

    const pending = page.onMilestoneDelete('ms-1');
    TestBed.inject(ConfirmDialogService).onCancel();
    await pending;

    http.expectNone((r) => r.method === 'DELETE');
    expect(page.milestones()).toHaveLength(1);
  });

  it('shows a load failure when the initiative cannot be read', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'init-1' }) } },
        },
      ],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(['initiatives:view']));
    http = TestBed.inject(HttpTestingController);

    const page = TestBed.runInInjectionContext(() => new InitiativeDetailPage());
    http.expectOne((r) => r.urlWithParams.endsWith('/api/user')).flush(ok([]));
    http.expectOne(isDetail).flush(
      { success: false, message: 'Initiative not found.' },
      { status: 404, statusText: 'Not Found' }
    );

    expect(page.initiative()).toBeNull();
    expect(page.loadError()).toBeTruthy();
    expect(page.loading()).toBe(false);
  });

  it('toggles the milestone three-dot menu and closes it on an outside click', () => {
    const page = start(['initiatives:milestones.manage', 'initiatives:progress.update']);
    const noop = { stopPropagation: () => {} } as unknown as MouseEvent;

    page.toggleMilestoneMenu('ms-1', noop);
    expect(page.milestoneMenuId()).toBe('ms-1');

    page.toggleMilestoneMenu('ms-1', noop);
    expect(page.milestoneMenuId()).toBeNull();

    page.toggleMilestoneMenu('ms-1', noop);
    page.closeMilestoneMenu();
    expect(page.milestoneMenuId()).toBeNull();
  });

  it('shows milestone actions in a three-dot menu instead of row icons', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'init-1' }) } },
        },
      ],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(['initiatives:milestones.manage', 'initiatives:progress.update']));
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(InitiativeDetailPage);
    fixture.detectChanges();
    http.expectOne((r) => r.urlWithParams.endsWith('/api/user')).flush(ok([]));
    http.expectOne(isDetail).flush(ok(initiative()));
    http.expectOne(isMilestones).flush(ok([milestone()]));
    http.expectOne(isHistory).flush(ok([]));
    http.expectOne(isCandidates).flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 200, totalPages: 0 }));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const kebab = host.querySelector('.row-actions .kebab-btn') as HTMLElement;
    expect(kebab).not.toBeNull();
    expect(host.querySelector('.row-actions .kebab-menu')).toBeNull();

    kebab.click();
    fixture.detectChanges();

    const menu = host.querySelector('.row-actions .kebab-menu') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.textContent).toContain('Update progress');
    expect(menu.textContent).toContain('Edit');
    expect(menu.textContent).toContain('Delete');
  });

  it('offers an Excel export for populated progress history', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'init-1' }) } },
        },
      ],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(['initiatives:view']));
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(InitiativeDetailPage);
    fixture.detectChanges();
    http.expectOne((r) => r.urlWithParams.endsWith('/api/user')).flush(ok([]));
    http.expectOne(isDetail).flush(ok(initiative()));
    http.expectOne(isMilestones).flush(ok([]));
    http.expectOne(isHistory).flush(ok([
      {
        id: 'e1',
        changeType: 'ProgressUpdated',
        details: 'Completion moved to 50%.',
        initiativeId: 'init-1',
        milestoneId: 'ms-1',
        milestoneName: 'Phase 1',
        previousValue: '30%',
        newValue: '50%',
        recordedByUserId: 'user-1',
        recordedAtUtc: '2026-06-01T10:00:00Z',
      },
    ]));
    http.expectOne(isCandidates).flush(ok({ items: [], totalCount: 0, page: 1, pageSize: 200, totalPages: 0 }));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const tabs = [...host.querySelectorAll<HTMLElement>('.tab')];
    const progressTab = tabs.find((t) => t.textContent?.includes('Progress history'));
    expect(progressTab).toBeTruthy();
    progressTab!.click();
    fixture.detectChanges();

    expect(host.querySelector('[aria-label="Export progress history to Excel"]')).not.toBeNull();
  });

  it('renders progress history as CSV that escapes commas and quotes for Excel', () => {
    const csv = historyToCsv(
      [
        {
          id: 'e1',
          changeType: 'MilestoneCreated',
          details: 'He said "hi", then left',
          initiativeId: 'init-1',
          milestoneId: 'ms-1',
          milestoneName: 'Phase 1',
          previousValue: undefined,
          newValue: undefined,
          recordedByUserId: undefined,
          recordedAtUtc: '2026-06-01T10:00:00Z',
        },
      ],
      (type) => type,
      (userId) => userId ?? '—'
    );

    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Recorded at,Type,Milestone,Previous value,New value,Details,Recorded by');
    expect(lines[1]).toContain('MilestoneCreated');
    expect(lines[1]).toContain('Phase 1');
    expect(lines[1]).toContain('—');
    expect(csv).toContain('"He said ""hi"", then left"');
  });
});