import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlanFilterService } from './plan-filter.service';

const FISCAL_YEARS = [
  { id: 'fy-1', label: '2025/2026', startDate: '2025-07-01', endDate: '2026-06-30', status: 'Open' },
  { id: 'fy-2', label: '2026/2027', startDate: '2026-07-01', endDate: '2027-06-30', status: 'Open' },
];

const SCORECARDS = [
  { id: 'sc-1', name: 'Corporate', fiscalYearId: 'fy-1', fiscalYearName: '2025/2026' },
  { id: 'sc-2', name: 'Division', fiscalYearId: 'fy-2', fiscalYearName: '2026/2027' },
];

const GOAL = { id: 'g-1', scorecardId: 'sc-1', name: 'Grow trade volume', weight: 40 };
const KRA = { id: 'k-1', goalId: 'g-1', scorecardId: 'sc-1', name: 'Win new mandates', weight: 50, isActive: true, kpiCount: 3 };

const ok = (data: unknown) => ({ success: true, message: 'ok', data });

describe('PlanFilterService', () => {
  let service: PlanFilterService;
  let http: HttpTestingController;

  const matches = (path: string) => (req: { url: string; urlWithParams: string }): boolean =>
    req.urlWithParams.endsWith(path);

  const expectCall = (path: string) => http.expectOne(matches(path));

  const loadOptions = (): void => {
    service.loadOptions();
    expectCall('/fiscalyear').flush(ok(FISCAL_YEARS));
    expectCall('/scorecard').flush(ok(SCORECARDS));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlanFilterService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists fiscal years newest first', () => {
    service.loadOptions();
    expectCall('/scorecard').flush(ok(SCORECARDS));
    expectCall('/fiscalyear').flush(ok(FISCAL_YEARS));

    expect(service.fiscalYears().map((fy) => fy.id)).toEqual(['fy-2', 'fy-1']);
  });

  it('narrows the scorecard options to the selected fiscal year', () => {
    loadOptions();
    expect(service.scorecards().map((sc) => sc.id)).toEqual(['sc-1', 'sc-2']);

    service.selectFiscalYear('fy-2');

    expect(service.fiscalYearId()).toBe('fy-2');
    expect(service.scorecards().map((sc) => sc.id)).toEqual(['sc-2']);
  });

  it('loads the goal options of a scorecard and clears the goal and KRA levels', () => {
    loadOptions();

    service.selectScorecard('sc-1');
    expectCall('/goal?scorecardId=sc-1').flush(ok([GOAL]));

    expect(service.goals()).toEqual([GOAL] as never);
    expect(service.goalId()).toBe('');
    expect(service.kras()).toEqual([]);
  });

  it('loads the KRA options of a goal and clears the KRA level', () => {
    loadOptions();
    service.applyScorecard('sc-1');
    expectCall('/goal?scorecardId=sc-1').flush(ok([GOAL]));

    service.selectGoal('g-1');
    expectCall('/kra?goalId=g-1').flush(ok([KRA]));

    expect(service.kras()).toEqual([KRA] as never);
    expect(service.kraId()).toBe('');

    service.selectScorecard('sc-1');
    expectCall('/goal?scorecardId=sc-1').flush(ok([GOAL]));

    expect(service.goalId()).toBe('');
    expect(service.kraId()).toBe('');
    expect(service.kras()).toEqual([]);
  });

  it('clears everything below when the fiscal year changes', () => {
    loadOptions();
    service.applyScorecard('sc-1');
    expectCall('/goal?scorecardId=sc-1').flush(ok([GOAL]));

    service.selectFiscalYear('fy-1');

    expect(service.scorecardId()).toBe('');
    expect(service.goalId()).toBe('');
    expect(service.kraId()).toBe('');
  });

  it('applies on every accepted change so the grid reloads itself', () => {
    loadOptions();
    let applies = 0;
    service.applies.subscribe(() => applies++);

    service.selectFiscalYear('fy-1');
    service.selectScorecard('sc-1');
    expectCall('/goal?scorecardId=sc-1').flush(ok([GOAL]));
    service.selectGoal('g-1');
    expectCall('/kra?goalId=g-1').flush(ok([KRA]));
    service.selectKra('k-1');
    service.reset();

    expect(applies).toBe(5);
  });

  it('adopts a scorecard passed in from the URL and labels it with its fiscal year', () => {
    loadOptions();
    let applies = 0;
    service.applies.subscribe(() => applies++);
    service.applyScorecard('sc-2');
    expectCall('/goal?scorecardId=sc-2').flush(ok([]));

    expect(service.scorecardId()).toBe('sc-2');
    expect(service.scorecardLabel('sc-2')).toBe('Division · 2026/2027');
    expect(service.scorecardLabel('missing')).toBe('—');
    expect(applies).toBe(1);
  });

  it('survives a failing option request', () => {
    service.loadOptions();
    expectCall('/fiscalyear').flush('boom', { status: 500, statusText: 'Server Error' });
    expectCall('/scorecard').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(service.fiscalYears()).toEqual([]);
    expect(service.allScorecards()).toEqual([]);
  });

  describe('applyHierarchy', () => {
    it('restores a full hierarchy from the URL and loads its options', () => {
      loadOptions();
      let applies = 0;
      service.applies.subscribe(() => applies++);

      service.applyHierarchy({ fiscalYearId: 'fy-1', scorecardId: 'sc-1', goalId: 'g-1', kraId: 'k-1' });
      expectCall('/goal?scorecardId=sc-1').flush(ok([GOAL]));
      expectCall('/kra?goalId=g-1').flush(ok([KRA]));

      expect(service.fiscalYearId()).toBe('fy-1');
      expect(service.scorecardId()).toBe('sc-1');
      expect(service.goalId()).toBe('g-1');
      expect(service.kraId()).toBe('k-1');
      expect(service.scorecards().map((sc) => sc.id)).toEqual(['sc-1']);
      expect(service.goals()).toEqual([GOAL] as never);
      expect(service.kras()).toEqual([KRA] as never);
      expect(applies).toBe(1);
    });

    it('keeps the fiscal year, which applyScorecard would clear', () => {
      loadOptions();
      service.applyHierarchy({ fiscalYearId: 'fy-2', scorecardId: 'sc-2' });
      expectCall('/goal?scorecardId=sc-2').flush(ok([]));

      expect(service.fiscalYearId()).toBe('fy-2');
      expect(service.scorecardId()).toBe('sc-2');
    });

    it('does not ask for goals or KRAs when the deep link has no scorecard', () => {
      loadOptions();

      service.applyHierarchy({ fiscalYearId: 'fy-1' });

      expect(service.fiscalYearId()).toBe('fy-1');
      expect(service.goals()).toEqual([]);
      expect(service.kras()).toEqual([]);
      http.verify();
    });

    it('treats missing or blank parameters as an empty level', () => {
      loadOptions();

      service.applyHierarchy({ fiscalYearId: null, scorecardId: '  ' });

      expect(service.fiscalYearId()).toBe('');
      expect(service.scorecardId()).toBe('');
    });
  });
});
