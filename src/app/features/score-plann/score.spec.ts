import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { KPI, KpiOwnerOption } from '../../core/model/goal.model';
import { Division } from '../division/division.model';
import { score } from './score';

const API = 'https://localhost:5211/api/';
const ok = (data: unknown) => ({ success: true, message: 'ok', data });

function employee(overrides: Partial<KpiOwnerOption> = {}): KpiOwnerOption {
  return {
    id: 'emp-1',
    fullName: 'Dereje Kebede',
    employeeCode: 'EMP-1001',
    email: 'dereje.kebede@ecx.com.et',
    positionName: 'Planner',
    divisionId: 'd-1',
    divisionName: 'Trading',
    ...overrides,
  };
}

function division(overrides: Partial<Division> = {}): Division {
  return {
    id: 'd-1',
    name: 'Trading',
    code: 'TRD',
    isActive: true,
    ...overrides,
  };
}

function kpi(overrides: Partial<KPI> = {}): KPI {
  return {
    id: 'k-1',
    scorecardId: 'sc-1',
    kraId: 'kra-1',
    name: 'Revenue growth',
    weight: 40,
    optimizationType: 'Maximize',
    dataSource: 'Manual',
    kpiType: 'Lagging',
    isCumulative: false,
    isActive: true,
    childKpiCount: 0,
    ...overrides,
  };
}

/** The app builds query strings into the URL, so read them from the raw url. */
function queryOf(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1] ?? '');
}

function isUrl(url: string, path: string): boolean {
  return url.split('?')[0] === `${API}${path}`;
}

describe('score (score-plann) KPI owner assignment', () => {
  let page: score;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    page = TestBed.runInInjectionContext(() => new score());
    http = TestBed.inject(HttpTestingController);
    // The hierarchy page is created without ngOnInit; the owner flow only needs a scorecard
    // and the local division list. No fiscal year keeps the workspace effect idle.
    page.state.scorecardId.set('sc-1');
    page.divisions.set([
      division(),
      division({ id: 'd-2', name: 'Operations', code: 'OPS' }),
      division({ id: 'd-3', name: 'Retired', code: 'RET', isActive: false }),
    ]);
    // RagThresholdStore loads once on creation and falls back to defaults.
    http.expectOne((r) => isUrl(r.url, 'ragthreshold')).flush(ok(null));
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.useRealTimers();
      TestBed.resetTestingModule();
    }
  });

  function lookupRequest(search?: string) {
    return http.expectOne((r) => {
      if (!isUrl(r.url, 'user/lookup')) return false;
      const params = queryOf(r.url);
      return search === undefined ? !params.has('search') : params.get('search') === search;
    });
  }

  function chooseIndividual(): void {
    page.openAddKpi('kra-1', 'goal-1');
    page.kpiForm.controls.ownerType.setValue('Individual');
    page.onOwnerTypeChange();
  }

  function chooseDivision(): void {
    page.openAddKpi('kra-1', 'goal-1');
    page.kpiForm.controls.ownerType.setValue('Division');
    page.onOwnerTypeChange();
  }

  it('loads active HR employees on demand and exposes position and division', () => {
    chooseIndividual();

    const request = lookupRequest();
    expect(queryOf(request.request.url).get('take')).toBe('50');
    request.flush(ok([employee()]));

    expect(page.ownerOptions()).toHaveLength(1);
    expect(page.ownerOptions()[0].positionName).toBe('Planner');
    expect(page.ownerOptions()[0].divisionName).toBe('Trading');
    expect(page.ownerSearching()).toBe(false);
  });

  it('searches employees by HR identifier after the debounce window', () => {
    chooseIndividual();
    lookupRequest().flush(ok([employee()]));

    vi.useFakeTimers();
    page.onOwnerSearchInput('EMP-1001');
    http.expectNone((r) => isUrl(r.url, 'user/lookup'));
    vi.advanceTimersByTime(300);

    const request = http.expectOne((r) => isUrl(r.url, 'user/lookup'));
    expect(queryOf(request.request.url).get('search')).toBe('EMP-1001');
    request.flush(ok([employee()]));

    expect(page.ownerOptions()).toHaveLength(1);
  });

  it('reports a failed employee search instead of showing stale results', () => {
    chooseIndividual();

    lookupRequest().flush('HR unavailable', { status: 500, statusText: 'Server Error' });

    expect(page.ownerOptions()).toEqual([]);
    expect(page.ownerSearchError()).toBeTruthy();
    expect(page.ownerSearching()).toBe(false);
  });

  it('requires an owner type and owner before creating a KPI', () => {
    page.openAddKpi('kra-1', 'goal-1');
    page.kpiForm.patchValue({ name: 'New KPI', weight: 40 });

    page.onSubmitCrud();

    expect(page.ownerError()).toContain('Choose');
    http.expectNone((r) => isUrl(r.url, 'kpi') && r.method === 'POST');
  });

  it('submits the selected individual as ownerId and never sends a division owner', () => {
    chooseIndividual();
    const owner = employee();
    lookupRequest().flush(ok([owner]));

    page.kpiForm.patchValue({ name: 'New KPI', weight: 40 });
    page.selectOwner(owner);
    page.onSubmitCrud();

    const request = http.expectOne((r) => isUrl(r.url, 'kpi') && r.method === 'POST');
    expect(request.request.body.ownerId).toBe(owner.id);
    expect(request.request.body.divisionOwnerId).toBeUndefined();
    request.flush(ok(kpi()));
  });

  it('submits the selected division as divisionOwnerId and never sends an individual', () => {
    chooseDivision();
    const trading = division();

    page.kpiForm.patchValue({ name: 'New KPI', weight: 40 });
    page.selectDivision(trading);
    page.onSubmitCrud();

    const request = http.expectOne((r) => isUrl(r.url, 'kpi') && r.method === 'POST');
    expect(request.request.body.divisionOwnerId).toBe(trading.id);
    expect(request.request.body.ownerId).toBeUndefined();
    request.flush(ok(kpi()));
  });

  it('clears the individual owner when switching to Division and blocks submission without one', () => {
    chooseIndividual();
    const owner = employee();
    lookupRequest().flush(ok([owner]));
    page.selectOwner(owner);

    page.kpiForm.controls.ownerType.setValue('Division');
    page.onOwnerTypeChange();

    expect(page.kpiForm.controls.ownerId.value).toBe('');
    expect(page.kpiForm.controls.divisionOwnerId.value).toBe('');
    expect(page.selectedOwner()).toBeNull();

    page.kpiForm.patchValue({ name: 'New KPI', weight: 40 });
    page.onSubmitCrud();

    expect(page.ownerError()).toContain('division');
    http.expectNone((r) => isUrl(r.url, 'kpi') && r.method === 'POST');
  });

  it('clears the division owner when switching to Individual and blocks submission without one', () => {
    chooseDivision();
    page.selectDivision(division());

    page.kpiForm.controls.ownerType.setValue('Individual');
    page.onOwnerTypeChange();
    lookupRequest().flush(ok([]));

    expect(page.kpiForm.controls.divisionOwnerId.value).toBe('');
    expect(page.kpiForm.controls.ownerId.value).toBe('');
    expect(page.selectedDivision()).toBeNull();

    page.kpiForm.patchValue({ name: 'New KPI', weight: 40 });
    page.onSubmitCrud();

    expect(page.ownerError()).toContain('employee');
    http.expectNone((r) => isUrl(r.url, 'kpi') && r.method === 'POST');
  });

  it('rejects an inactive division before submitting', () => {
    chooseDivision();
    page.selectDivision(division({ id: 'd-3', name: 'Retired', code: 'RET', isActive: false }));

    page.kpiForm.patchValue({ name: 'New KPI', weight: 40 });
    page.onSubmitCrud();

    expect(page.ownerError()).toContain('inactive');
    http.expectNone((r) => isUrl(r.url, 'kpi') && r.method === 'POST');
  });

  it('filters local divisions by name and code and hides inactive divisions', () => {
    chooseDivision();

    expect(page.divisionResults().map((row) => row.id)).toEqual(['d-1', 'd-2']);

    page.onDivisionSearchInput('ops');
    expect(page.divisionResults().map((row) => row.id)).toEqual(['d-2']);

    page.onDivisionSearchInput('trd');
    expect(page.divisionResults().map((row) => row.id)).toEqual(['d-1']);

    page.onDivisionSearchInput('ret');
    expect(page.divisionResults()).toEqual([]);
  });

  it('restores an individual owner when editing and keeps it on update', () => {
    const existing = kpi({ ownerId: 'emp-1', ownerName: 'Dereje Kebede' });
    page.openEditKpi(existing, new MouseEvent('click'));

    http.expectOne((r) => isUrl(r.url, 'kpi/k-1')).flush(ok(existing));
    const request = lookupRequest('Dereje Kebede');
    request.flush(ok([employee()]));

    expect(page.kpiForm.controls.ownerType.value).toBe('Individual');
    expect(page.kpiForm.controls.ownerId.value).toBe('emp-1');
    expect(page.selectedOwner()?.positionName).toBe('Planner');

    page.onSubmitCrud();
    const update = http.expectOne((r) => isUrl(r.url, 'kpi/k-1') && r.method === 'PUT');
    expect(update.request.body.ownerId).toBe('emp-1');
    expect(update.request.body.divisionOwnerId).toBeUndefined();
    update.flush(ok(existing));
  });

  it('restores a division owner when editing', () => {
    const existing = kpi({ divisionOwnerId: 'd-1', divisionOwnerName: 'Trading' });
    page.openEditKpi(existing, new MouseEvent('click'));

    http.expectOne((r) => isUrl(r.url, 'kpi/k-1')).flush(ok(existing));

    expect(page.kpiForm.controls.ownerType.value).toBe('Division');
    expect(page.kpiForm.controls.divisionOwnerId.value).toBe('d-1');
    expect(page.selectedDivision()?.name).toBe('Trading');
    expect(page.selectedDivision()?.code).toBe('TRD');
  });

  it('surfaces a division load failure instead of an empty picker', () => {
    page.divisions.set([]);
    page.loadDivisions();

    http
      .expectOne((r) => isUrl(r.url, 'division'))
      .flush('unavailable', { status: 500, statusText: 'Server Error' });

    expect(page.divisionsLoading()).toBe(false);
    expect(page.divisionLoadError()).toBeTruthy();
    expect(page.divisionResults()).toEqual([]);
  });
});
