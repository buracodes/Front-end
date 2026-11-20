import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReportsPage } from './reports';
import { ReportService, ReportTemplate } from './report.service';
import { ScorecardService } from '../../core/service/scorecard.service';
import { DivisionService } from '../division/division.service';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import { FiscalYear, Scorecard } from '../../core/model/scorecard.model';

const TEMPLATES: ReportTemplate[] = [
  { id: 'scorecard-performance', name: 'Scorecard Performance', description: '', requiresScorecard: true, requiresDivision: false },
  { id: 'kpi-detail', name: 'KPI Details & Trends', description: '', requiresScorecard: true, requiresDivision: false },
  { id: 'division-performance', name: 'Division Performance', description: '', requiresScorecard: true, requiresDivision: true },
  { id: 'initiative-status', name: 'Initiative Status', description: '', requiresScorecard: false, requiresDivision: false },
];

/** A fiscal year that starts in July, the usual ECX year. */
function fiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: 'fy-1',
    label: 'FY2026',
    startDate: '2025-07-01',
    endDate: '2026-06-30',
    status: 'Active',
    ...overrides,
  };
}

function scorecard(overrides: Partial<Scorecard> = {}): Scorecard {
  return {
    id: 'sc-1',
    fiscalYearId: 'fy-1',
    name: 'Corporate 2026',
    scorecardStatus: 'Active',
    ...overrides,
  };
}

describe('ReportsPage', () => {
  let reportService: {
    getTemplates: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
    export: ReturnType<typeof vi.fn>;
  };
  let scorecardService: {
    getFiscalYears: ReturnType<typeof vi.fn>;
    getAll: ReturnType<typeof vi.fn>;
  };
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let permissions: string[];

  const userStore = {
    hasPermission: (permission: string) => permissions.includes(permission),
  };

  const start = (granted: string[]): ReportsPage => {
    permissions = granted;
    TestBed.configureTestingModule({
      providers: [
        { provide: ReportService, useValue: reportService },
        { provide: ScorecardService, useValue: scorecardService },
        { provide: DivisionService, useValue: { getAll: () => of([]) } },
        { provide: NotificationService, useValue: notifications },
        { provide: UserStore, useValue: userStore },
      ],
    });
    return TestBed.runInInjectionContext(() => new ReportsPage());
  };

  /** A page that can generate: templates loaded, a KPI report and a scorecard selected. */
  const ready = (granted: string[] = ['reports:view']): ReportsPage => {
    const page = start(granted);
    page.templates.set(TEMPLATES);
    page.templateId.set('kpi-detail');
    page.scorecardId.set('sc-1');
    return page;
  };

  const generatedFilter = () => reportService.generate.mock.calls[0][0];

  beforeEach(() => {
    reportService = {
      getTemplates: vi.fn(() => of(TEMPLATES)),
      generate: vi.fn(() => of({})),
      export: vi.fn(() => of(new Blob(['x']))),
    };
    scorecardService = {
      getFiscalYears: vi.fn(() => of([])),
      getAll: vi.fn(() => of([])),
    };
    notifications = { success: vi.fn(), error: vi.fn() };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('hides the division performance card without divisions:reports.view', () => {
    const page = start(['reports:view']);
    page.templates.set(TEMPLATES);

    expect(page.cards().some((c) => c.templateId === 'division-performance')).toBe(false);
    expect(page.cards().map((c) => c.templateId)).toContain('kpi-detail');
  });

  it('shows the division performance card when divisions:reports.view is granted', () => {
    const page = start(['reports:view', 'divisions:reports.view']);
    page.templates.set(TEMPLATES);

    expect(page.cards().some((c) => c.templateId === 'division-performance')).toBe(true);
  });

  it('blocks exports without reports:export', () => {
    const page = start(['reports:view']);

    expect(page.canExport()).toBe(false);
    page.export('pdf');

    expect(reportService.export).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('You do not have permission to export reports.');
  });

  it('allows a permitted user to export once a template is selected', () => {
    const page = start(['reports:view', 'reports:export']);

    expect(page.canExport()).toBe(true);
    page.export('pdf');

    // No template has been selected yet, so the ordinary filter validation blocks it.
    expect(reportService.export).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('Please select a report template.');
  });

  it('offers all four granularities and opens on YTD like Filter by Period', () => {
    const page = start(['reports:view']);

    expect(page.granularityOptions.map((option) => option.value)).toEqual(['ytd', 'quarter', 'month', 'year']);
    expect(page.granularityOptions.map((option) => option.label)).toEqual(['YTD', 'Quarter', 'Month', 'Year']);
    expect(page.granularity()).toBe('ytd');
    expect(page.showMonthRange()).toBe(false);
    expect(page.showQuarter()).toBe(false);
    expect(page.showYear()).toBe(false);
  });

  it('picks the granularity-specific controls', () => {
    const page = ready();

    page.granularity.set('month');
    expect(page.showMonthRange()).toBe(true);
    expect(page.showQuarter()).toBe(false);
    expect(page.showYear()).toBe(false);

    page.granularity.set('quarter');
    expect(page.showMonthRange()).toBe(false);
    expect(page.showQuarter()).toBe(true);
    expect(page.showYear()).toBe(false);

    page.granularity.set('year');
    expect(page.showMonthRange()).toBe(false);
    expect(page.showQuarter()).toBe(false);
    expect(page.showYear()).toBe(true);

    page.granularity.set('ytd');
    expect(page.showMonthRange()).toBe(false);
    expect(page.showQuarter()).toBe(false);
    expect(page.showYear()).toBe(false);
  });

  it('labels fiscal months and quarters from the selected fiscal year', () => {
    const page = start(['reports:view']);
    page.fiscalYears.set([fiscalYear()]);
    page.fiscalYearId.set('fy-1');

    expect(page.monthOptions()[0].label).toBe('Jul 2025');
    expect(page.monthOptions()[11].label).toBe('Jun 2026');
    expect(page.quarterOptions()[0].label).toBe('Q1 (Jul – Sep 2025)');
    expect(page.quarterOptions()[3].label).toBe('Q4 (Apr – Jun 2026)');
  });

  it("labels periods from the scorecard's fiscal year when the header year is unset", () => {
    const page = start(['reports:view']);
    page.fiscalYears.set([fiscalYear()]);
    page.scorecards.set([scorecard()]);
    page.scorecardId.set('sc-1');

    expect(page.monthOptions()[0].label).toBe('Jul 2025');
    expect(page.quarterOptions()[0].label).toBe('Q1 (Jul – Sep 2025)');
  });

  it('blocks generation when From month is after To month', () => {
    const page = ready();
    page.granularity.set('month');
    page.fromMonth.set(6);
    page.toMonth.set(3);

    expect(page.monthRangeInvalid()).toBe(true);
    page.generate();

    expect(notifications.error).toHaveBeenCalledWith('From month must be before or equal to To month.');
    expect(reportService.generate).not.toHaveBeenCalled();
  });

  it('sends only the period fields that belong to the chosen granularity', () => {
    const page = ready();

    page.granularity.set('month');
    page.fromMonth.set(2);
    page.toMonth.set(5);
    page.generate();
    expect(generatedFilter()).toMatchObject({ granularity: 'month', fromMonth: 2, toMonth: 5 });
    expect(generatedFilter().quarter).toBeUndefined();

    page.granularity.set('quarter');
    page.quarter.set(3);
    page.generate();
    expect(reportService.generate.mock.calls[1][0]).toMatchObject({ granularity: 'quarter', quarter: 3 });
    expect(reportService.generate.mock.calls[1][0].fromMonth).toBeUndefined();
    expect(reportService.generate.mock.calls[1][0].toMonth).toBeUndefined();

    page.granularity.set('ytd');
    page.generate();
    expect(reportService.generate.mock.calls[2][0].granularity).toBe('ytd');
    expect(reportService.generate.mock.calls[2][0].quarter).toBeUndefined();
  });

  it('resets every period control back to YTD', () => {
    const page = ready();
    page.granularity.set('month');
    page.fromMonth.set(3);
    page.toMonth.set(5);
    page.quarter.set(2);

    page.resetFilters();

    expect(page.granularity()).toBe('ytd');
    expect(page.fromMonth()).toBeNull();
    expect(page.toMonth()).toBeNull();
    expect(page.quarter()).toBeNull();
  });

  it('drops the period controls when a summary template is selected', () => {
    const page = ready();
    page.granularity.set('month');
    page.fromMonth.set(2);
    page.toMonth.set(4);

    const initiative = page.cards().find((card) => card.key === 'initiative-list')!;
    page.selectCard(initiative);

    expect(page.showGranularity()).toBe(false);
    expect(page.granularity()).toBe('ytd');
    expect(page.fromMonth()).toBeNull();
    expect(page.toMonth()).toBeNull();

    page.generate();
    expect(generatedFilter().granularity).toBeUndefined();
    expect(generatedFilter().fromMonth).toBeUndefined();
  });

  it('keeps the period filter when switching between period-based templates', () => {
    const page = ready();
    page.granularity.set('quarter');
    page.quarter.set(2);

    const summary = page.cards().find((card) => card.key === 'scorecard-summary')!;
    page.selectCard(summary);

    expect(page.granularity()).toBe('quarter');
    expect(page.quarter()).toBe(2);
    page.generate();
    expect(generatedFilter().granularity).toBe('quarter');
  });

  it('edits the fiscal year from the Year granularity and reloads its scorecards', () => {
    const page = start(['reports:view']);
    page.granularity.set('year');

    page.onPeriodYearChange('fy-2');

    expect(page.fiscalYearId()).toBe('fy-2');
    expect(scorecardService.getAll).toHaveBeenCalledWith('fy-2');
  });
});
