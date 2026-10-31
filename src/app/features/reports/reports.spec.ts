import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReportsPage } from './reports';
import { ReportService, ReportTemplate } from './report.service';
import { ScorecardService } from '../../core/service/scorecard.service';
import { DivisionService } from '../division/division.service';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';

const TEMPLATES: ReportTemplate[] = [
  { id: 'scorecard-performance', name: 'Scorecard Performance', description: '', requiresScorecard: true, requiresDivision: false },
  { id: 'kpi-detail', name: 'KPI Details & Trends', description: '', requiresScorecard: true, requiresDivision: false },
  { id: 'division-performance', name: 'Division Performance', description: '', requiresScorecard: true, requiresDivision: true },
  { id: 'initiative-status', name: 'Initiative Status', description: '', requiresScorecard: false, requiresDivision: false },
];

describe('ReportsPage', () => {
  let reportService: {
    getTemplates: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
    export: ReturnType<typeof vi.fn>;
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
        {
          provide: ScorecardService,
          useValue: { getFiscalYears: () => of([]), getAll: () => of([]) },
        },
        { provide: DivisionService, useValue: { getAll: () => of([]) } },
        { provide: NotificationService, useValue: notifications },
        { provide: UserStore, useValue: userStore },
      ],
    });
    return TestBed.runInInjectionContext(() => new ReportsPage());
  };

  beforeEach(() => {
    reportService = {
      getTemplates: vi.fn(() => of(TEMPLATES)),
      generate: vi.fn(() => of({})),
      export: vi.fn(() => of(new Blob(['x']))),
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
});
