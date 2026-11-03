import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Division } from '../division/division.model';
import { Kpi, KpiOwnerOption } from './kpi.model';
import { KpiPage } from './kpi';

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

function kpi(overrides: Partial<Kpi> = {}): Kpi {
  return {
    id: 'k-1',
    scorecardId: 'sc-1',
    scorecardName: 'Corporate 2026',
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

describe('KpiPage owner assignment', () => {
  let page: KpiPage;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    page = TestBed.runInInjectionContext(() => new KpiPage());
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      // Score snapshots are scheduled from an effect and are not part of owner assignment.
      http
        .match((r) => r.url.startsWith(`${API}scoresnapshot`))
        .forEach((request) => request.flush(ok({ scorecardId: 'sc-1', fiscalYearId: 'fy-1', kpiSnapshots: [] })));
      http.verify();
    } finally {
      vi.useRealTimers();
      TestBed.resetTestingModule();
    }
  });

  /** Constructor issues: fiscal years, two scorecard reads, KPIs, KRAs and divisions. */
  function settle(kpis: Kpi[] = [], divisions: Division[] = [division(), division({ id: 'd-2', name: 'Operations', code: 'OPS' })]): void {
    http.expectOne((r) => isUrl(r.url, 'fiscalyear')).flush(ok([]));
    http.match((r) => isUrl(r.url, 'scorecard')).forEach((request) =>
      request.flush(ok([{ id: 'sc-1', fiscalYearId: 'fy-1', fiscalYearName: 'FY 2026', name: 'Corporate 2026', scope: 'Corporate' }])),
    );
    http.expectOne((r) => isUrl(r.url, 'kpi')).flush(ok(kpis));
    http.expectOne((r) => isUrl(r.url, 'kra')).flush(ok([]));
    http.expectOne((r) => isUrl(r.url, 'division')).flush(ok(divisions));
  }

  /** The app builds query strings into the URL, so read them from the raw url. */
  function queryOf(url: string): URLSearchParams {
    return new URLSearchParams(url.split('?')[1] ?? '');
  }

  function isUrl(url: string, path: string): boolean {
    return url.split('?')[0] === `${API}${path}`;
  }

  function lookupRequest(search?: string) {
    return http.expectOne((r) => {
      if (!isUrl(r.url, 'user/lookup')) return false;
      const params = queryOf(r.url);
      return search === undefined ? !params.has('search') : params.get('search') === search;
    });
  }

  function chooseIndividual(): void {
    page.openAddModal();
    page.form.controls.ownerType.setValue('Individual');
    page.onOwnerTypeChange();
  }

  function chooseDivision(): void {
    page.openAddModal();
    page.form.controls.ownerType.setValue('Division');
    page.onOwnerTypeChange();
  }

  it('loads active HR employees on demand and shows position and division', () => {
    settle();
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
    settle();
    chooseIndividual();
    lookupRequest().flush(ok([employee()]));

    vi.useFakeTimers();
    page.onOwnerSearchInput('EMP-1001');
    http.expectNone((r) => r.url === `${API}user/lookup`);
    vi.advanceTimersByTime(300);

    const request = http.expectOne((r) => isUrl(r.url, 'user/lookup'));
    expect(queryOf(request.request.url).get('search')).toBe('EMP-1001');
    request.flush(ok([employee()]));

    expect(page.ownerOptions()).toHaveLength(1);
  });

  it('reports a failed employee search instead of showing stale results', () => {
    settle();
    chooseIndividual();

    lookupRequest().flush('HR unavailable', { status: 500, statusText: 'Server Error' });

    expect(page.ownerOptions()).toEqual([]);
    expect(page.ownerSearchError()).toBeTruthy();
    expect(page.ownerSearching()).toBe(false);
  });

  it('submits the selected individual as ownerId and never sends a division owner', () => {
    settle();
    chooseIndividual();
    const owner = employee();
    lookupRequest().flush(ok([owner]));

    page.form.patchValue({ scorecardId: 'sc-1', name: 'New KPI', weight: 40 });
    page.selectOwner(owner);
    page.onSubmit();

    const request = http.expectOne((r) => r.url === `${API}kpi` && r.method === 'POST');
    expect(request.request.body.ownerId).toBe(owner.id);
    expect(request.request.body.divisionOwnerId).toBeUndefined();
    request.flush(ok(kpi()));
    http.expectOne((r) => r.url === `${API}kpi` && r.method === 'GET').flush(ok([]));
  });

  it('submits the selected division as divisionOwnerId and never sends an individual', () => {
    settle();
    chooseDivision();
    const trading = division();

    page.form.patchValue({ scorecardId: 'sc-1', name: 'New KPI', weight: 40 });
    page.selectDivision(trading);
    page.onSubmit();

    const request = http.expectOne((r) => r.url === `${API}kpi` && r.method === 'POST');
    expect(request.request.body.divisionOwnerId).toBe(trading.id);
    expect(request.request.body.ownerId).toBeUndefined();
    request.flush(ok(kpi()));
    http.expectOne((r) => r.url === `${API}kpi` && r.method === 'GET').flush(ok([]));
  });

  it('clears the previous owner when the owner type changes and blocks submission without an owner', () => {
    settle();
    chooseIndividual();
    const owner = employee();
    lookupRequest().flush(ok([owner]));
    page.selectOwner(owner);

    page.form.controls.ownerType.setValue('Division');
    page.onOwnerTypeChange();

    expect(page.form.controls.ownerId.value).toBe('');
    expect(page.form.controls.divisionOwnerId.value).toBe('');
    expect(page.selectedOwner()).toBeNull();

    page.form.patchValue({ scorecardId: 'sc-1', name: 'New KPI', weight: 40 });
    page.onSubmit();

    expect(page.ownerError()).toContain('division');
    http.expectNone((r) => r.url === `${API}kpi` && r.method === 'POST');
  });

  it('filters divisions by name and code and hides inactive divisions', () => {
    settle([], [division(), division({ id: 'd-2', name: 'Operations', code: 'OPS' }), division({ id: 'd-3', name: 'Retired', code: 'RET', isActive: false })]);
    chooseDivision();

    expect(page.divisionResults().map((row) => row.id)).toEqual(['d-1', 'd-2']);

    page.onDivisionSearchInput('ops');
    expect(page.divisionResults().map((row) => row.id)).toEqual(['d-2']);

    page.onDivisionSearchInput('trd');
    expect(page.divisionResults().map((row) => row.id)).toEqual(['d-1']);

    page.onDivisionSearchInput('ret');
    expect(page.divisionResults()).toEqual([]);
  });

  it('restores an individual owner when editing and enriches it from HR', () => {
    settle([kpi({ ownerId: 'emp-1', ownerName: 'Dereje Kebede' })]);
    page.onEdit(kpi({ ownerId: 'emp-1', ownerName: 'Dereje Kebede' }));

    http.expectOne((r) => isUrl(r.url, 'kra') && queryOf(r.url).get('scorecardId') === 'sc-1').flush(ok([]));
    const request = http.expectOne((r) => isUrl(r.url, 'user/lookup'));
    expect(queryOf(request.request.url).get('search')).toBe('Dereje Kebede');
    request.flush(ok([employee()]));

    expect(page.form.controls.ownerType.value).toBe('Individual');
    expect(page.form.controls.ownerId.value).toBe('emp-1');
    expect(page.selectedOwner()?.positionName).toBe('Planner');
  });

  it('restores a division owner when editing', () => {
    settle([kpi({ divisionOwnerId: 'd-1', divisionOwnerName: 'Trading' })]);
    page.onEdit(kpi({ divisionOwnerId: 'd-1', divisionOwnerName: 'Trading' }));

    http.expectOne((r) => isUrl(r.url, 'kra') && queryOf(r.url).get('scorecardId') === 'sc-1').flush(ok([]));

    expect(page.form.controls.ownerType.value).toBe('Division');
    expect(page.form.controls.divisionOwnerId.value).toBe('d-1');
    expect(page.selectedDivision()?.name).toBe('Trading');
    expect(page.selectedDivision()?.code).toBe('TRD');
  });
});
