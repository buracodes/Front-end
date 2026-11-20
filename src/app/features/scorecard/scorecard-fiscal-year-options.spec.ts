import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ScorecardPage } from './scorecard';
import { ScorecardService } from './scorecard.service';
import { ScorecardService as CoreScorecardService } from '../../core/service/scorecard.service';
import { FiscalYearService } from '../fiscal-year/fiscal-year.service';
import { FiscalYear } from '../../core/model/scorecard.model';
import { Scorecard } from './scorecard.model';

const fiscalYear = (id: string, status: string): FiscalYear => ({
  id,
  label: `FY ${id}`,
  startDate: '2027-01-01',
  endDate: '2027-12-31',
  status,
});

const ALL_YEARS: FiscalYear[] = [
  fiscalYear('fy-open-1', 'Open'),
  fiscalYear('fy-closed', 'Closed'),
  fiscalYear('fy-open-2', 'open'),
  fiscalYear('fy-archived', 'Archived'),
];

describe('ScorecardPage create fiscal-year dropdown', () => {
  let page: ScorecardPage;
  let coreScorecardService: CoreScorecardService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    coreScorecardService = TestBed.inject(CoreScorecardService);
    vi.spyOn(coreScorecardService, 'getFiscalYears').mockReturnValue(of(ALL_YEARS));
    vi.spyOn(TestBed.inject(ScorecardService), 'getAll').mockReturnValue(of([]));
    page = TestBed.runInInjectionContext(() => new ScorecardPage());
    page.ngOnInit();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('offers only active (Open) fiscal years when creating a new scorecard', () => {
    page.openAddModal();

    expect(page.fiscalYearOptions().map((fy) => fy.id)).toEqual(['fy-open-1', 'fy-open-2']);
  });

  it('keeps closed and archived years available when editing an existing scorecard', () => {
    const scorecard: Scorecard = {
      id: 'sc-1',
      fiscalYearId: 'fy-closed',
      fiscalYearName: 'FY fy-closed',
      name: 'Existing Scorecard',
      scorecardStatus: 'Active',
    };
    page.onEdit(scorecard, { stopPropagation: vi.fn() } as unknown as MouseEvent);

    expect(page.fiscalYearOptions().map((fy) => fy.id)).toEqual(ALL_YEARS.map((fy) => fy.id));
    expect(page.form.controls.fiscalYearId.value).toBe('fy-closed');
  });

  it('renders only open fiscal years in the create dropdown', () => {
    const fixture: ComponentFixture<ScorecardPage> = TestBed.createComponent(ScorecardPage);
    fixture.detectChanges();
    fixture.componentInstance.openAddModal();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('#scorecard-fiscal-year-id') as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toEqual(['', 'fy-open-1', 'fy-open-2']);
  });

  it('preselects a newly created (open) fiscal year in the create dropdown', () => {
    const created = fiscalYear('fy-new', 'Open');
    vi.mocked(coreScorecardService.getFiscalYears).mockReturnValue(of([...ALL_YEARS, created]));
    vi.spyOn(TestBed.inject(FiscalYearService), 'create').mockReturnValue(of(created));

    page.openAddFiscalYearModal();
    page.fiscalYearForm.setValue({ label: 'FY New', startMonth: '2027-01' });
    page.onSubmitFiscalYear();

    expect(page.form.controls.fiscalYearId.value).toBe('fy-new');
    expect(page.fiscalYearOptions().map((fy) => fy.id)).toContain('fy-new');
  });
});
