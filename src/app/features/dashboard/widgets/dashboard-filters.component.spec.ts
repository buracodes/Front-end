import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardFiltersComponent } from './dashboard-filters.component';
import { DashboardFilter, DashboardFilterOption } from '../role-dashboard.model';

const YEARS: DashboardFilterOption[] = [
  { id: 'fy-2026', label: '2026/2027', isSelected: true, detail: 'Open', startDate: '2026-07-01' },
  { id: 'fy-2025', label: '2025/2026', isSelected: false, detail: 'Closed', startDate: '2025-07-01' },
];

const SCORECARDS = [
  { id: 'sc-1', label: 'Corporate Scorecard' },
  { id: 'sc-2', label: 'Operations' },
];

const FILTER: DashboardFilter = {
  fiscalYearId: 'fy-2026',
  scorecardId: 'sc-1',
  periodType: 'Ytd',
  quarter: null,
  fromMonth: null,
  toMonth: null,
};

interface Harness {
  fixture: ComponentFixture<DashboardFiltersComponent>;
  emitted: DashboardFilter[];
}

function mount(overrides: Partial<DashboardFilter> = {}, years: DashboardFilterOption[] = YEARS): Harness {
  const fixture = TestBed.createComponent(DashboardFiltersComponent);
  fixture.componentRef.setInput('filter', { ...FILTER, ...overrides });
  fixture.componentRef.setInput('fiscalYears', years);
  fixture.componentRef.setInput('scorecards', SCORECARDS);

  const emitted: DashboardFilter[] = [];
  fixture.componentInstance.filterChange.subscribe((value) => emitted.push(value));

  fixture.detectChanges();
  return { fixture, emitted };
}

function rootOf(harness: Harness): HTMLElement {
  return harness.fixture.nativeElement as HTMLElement;
}

function openPanel(harness: Harness): void {
  const trigger = rootOf(harness).querySelector('.period-btn') as HTMLButtonElement;
  trigger.click();
  harness.fixture.detectChanges();
}

function clickTab(harness: Harness, label: string): void {
  const button = Array.from(rootOf(harness).querySelectorAll<HTMLButtonElement>('.period-types button'))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Tab ${label} not found`);
  button.click();
  harness.fixture.detectChanges();
}

function selectValue(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('DashboardFiltersComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardFiltersComponent],
    }).compileComponents();
  });

  it('opens and closes the period popover from the trigger', () => {
    const harness = mount();
    expect(rootOf(harness).querySelector('.period-panel')).toBeNull();

    openPanel(harness);
    expect(rootOf(harness).querySelector('.period-panel')).toBeTruthy();
    expect(rootOf(harness).querySelector('.period-btn')?.getAttribute('aria-expanded')).toBe('true');

    (rootOf(harness).querySelector('.period-btn') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    expect(rootOf(harness).querySelector('.period-panel')).toBeNull();
  });

  it('pins the popover to the trigger without leaving the viewport', () => {
    const harness = mount();
    const trigger = rootOf(harness).querySelector('.period-btn') as HTMLElement;
    // Trigger near the right edge of a 1024px viewport.
    trigger.getBoundingClientRect = () =>
      ({ left: 1300, top: 100, right: 1450, bottom: 136, width: 150, height: 36, x: 1300, y: 100, toJSON: () => ({}) }) as DOMRect;

    openPanel(harness);

    const panel = rootOf(harness).querySelector('.period-panel') as HTMLElement;
    expect(panel.style.left).toBe('712px'); // 1024 - 300 - 12
    expect(panel.style.top).toBe('142px'); // trigger bottom + 6
  });

  it('opens upwards when the trigger is near the bottom of the viewport', () => {
    const harness = mount();
    const trigger = rootOf(harness).querySelector('.period-btn') as HTMLElement;
    trigger.getBoundingClientRect = () =>
      ({ left: 800, top: 700, right: 950, bottom: 736, width: 150, height: 36, x: 800, y: 700, toJSON: () => ({}) }) as DOMRect;

    openPanel(harness);

    const panel = rootOf(harness).querySelector('.period-panel') as HTMLElement;
    expect(panel.style.top).toBe('454px'); // trigger top - gap - estimated height
    expect(panel.style.left).toBe('650px');
  });

  it('offers the four Scorecards period types with the applied one selected', () => {
    const harness = mount();
    openPanel(harness);

    const labels = Array.from(rootOf(harness).querySelectorAll('.period-types button'))
      .map((button) => button.textContent?.trim());
    expect(labels).toEqual(['YTD', 'Month', 'Quarter', 'Year']);
    expect(rootOf(harness).querySelector('.period-types button.active')?.textContent?.trim()).toBe('YTD');
  });

  it('applies YTD immediately and explains what it covers', () => {
    const harness = mount();
    openPanel(harness);

    expect(rootOf(harness).querySelector('.period-hint')?.textContent).toContain('fiscal year');

    clickTab(harness, 'YTD');
    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0]).toMatchObject({
      // The fiscal year and scorecard stay as they are; only the period changes.
      fiscalYearId: 'fy-2026',
      scorecardId: 'sc-1',
      periodType: 'Ytd',
      quarter: null,
      fromMonth: null,
      toMonth: null,
    });
  });

  it('lists the twelve fiscal months in the year start order', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Month');

    const options = Array.from(rootOf(harness).querySelectorAll('.period-month-row select:first-of-type option'))
      .map((option) => option.textContent?.trim())
      .filter((label) => label && label !== 'From');

    expect(options).toHaveLength(12);
    expect(options[0]).toBe('Jul 2026');
    expect(options[5]).toBe('Dec 2026');
    expect(options[6]).toBe('Jan 2027');
    expect(options[11]).toBe('Jun 2027');
  });

  it('falls back to fiscal-month numbering when the year has no start date', () => {
    const years = YEARS.map(({ startDate, ...year }) => year);
    const harness = mount({}, years);
    openPanel(harness);
    clickTab(harness, 'Month');

    const options = Array.from(rootOf(harness).querySelectorAll('.period-month-row select:first-of-type option'))
      .map((option) => option.textContent?.trim())
      .filter((label) => label && label !== 'From');

    expect(options[0]).toBe('Month 1');
    expect(options[11]).toBe('Month 12');
  });

  it('applies a Month range only once both ends are chosen', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Month');

    const [from, to] = Array.from(rootOf(harness).querySelectorAll<HTMLSelectElement>('.period-month-row select'));

    selectValue(from, '7');
    harness.fixture.detectChanges();
    expect(harness.emitted).toHaveLength(0);

    selectValue(to, '9');
    harness.fixture.detectChanges();
    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0]).toMatchObject({ periodType: 'Month', fromMonth: 7, toMonth: 9, quarter: null });
  });

  it('rejects a Month range that runs backwards', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Month');

    const [from, to] = Array.from(rootOf(harness).querySelectorAll<HTMLSelectElement>('.period-month-row select'));

    selectValue(from, '9');
    harness.fixture.detectChanges();
    selectValue(to, '3');
    harness.fixture.detectChanges();

    expect(harness.emitted).toHaveLength(0);
    expect(rootOf(harness).querySelector('.period-month-row.invalid')).toBeTruthy();
    expect(rootOf(harness).querySelector('.period-error')?.textContent).toContain('From month');
  });

  it('labels quarters with their fiscal month span and applies the choice', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Quarter');

    const options = Array.from(rootOf(harness).querySelectorAll('.period-select option'))
      .map((option) => option.textContent?.trim())
      .filter((label) => label && label !== 'Select quarter');

    expect(options).toEqual([
      'Q1 (Jul - Sep 2026)',
      'Q2 (Oct - Dec 2026)',
      'Q3 (Jan - Mar 2027)',
      'Q4 (Apr - Jun 2027)',
    ]);

    selectValue(rootOf(harness).querySelector('.period-select') as HTMLSelectElement, '2');
    harness.fixture.detectChanges();

    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0]).toMatchObject({ periodType: 'Quarter', quarter: 2, fromMonth: null, toMonth: null });
  });

  it('applies the Year tab through the fiscal-year picker', () => {
    const harness = mount();
    openPanel(harness);
    // Selecting Year applies the period immediately, exactly like the Scorecards module.
    clickTab(harness, 'Year');
    expect(harness.emitted.at(-1)).toMatchObject({ periodType: 'Year', fiscalYearId: 'fy-2026' });

    const select = rootOf(harness).querySelector('.period-select') as HTMLSelectElement;
    const labels = Array.from(select.options).map((option) => option.textContent?.trim());
    expect(labels).toContain('2026/2027');
    expect(labels).toContain('2025/2026');

    selectValue(select, 'fy-2025');
    harness.fixture.detectChanges();

    expect(harness.emitted.at(-1)).toMatchObject({
      fiscalYearId: 'fy-2025',
      scorecardId: 'sc-1',
      periodType: 'Year',
      quarter: null,
      fromMonth: null,
      toMonth: null,
    });
  });

  it('resets everything to YTD from Clear Period Filter but keeps year and scorecard', () => {
    const harness = mount({ periodType: 'Quarter', quarter: 3 });
    openPanel(harness);

    const clear = rootOf(harness).querySelector('.period-clear') as HTMLButtonElement;
    expect(clear.textContent?.trim()).toBe('Clear Period Filter');
    clear.click();
    harness.fixture.detectChanges();

    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0]).toMatchObject({
      fiscalYearId: 'fy-2026',
      scorecardId: 'sc-1',
      periodType: 'Ytd',
      quarter: null,
      fromMonth: null,
      toMonth: null,
    });
    expect(rootOf(harness).querySelector('.period-types button.active')?.textContent?.trim()).toBe('YTD');
    expect(rootOf(harness).querySelector('.period-hint')).toBeTruthy();
  });

  it('shows an active marker only when a period filter is applied', () => {
    const ytd = mount();
    expect(rootOf(ytd).querySelector('.period-dot')).toBeNull();

    const filtered = mount({ periodType: 'Month', fromMonth: 7, toMonth: 9 });
    expect(rootOf(filtered).querySelector('.period-dot')).toBeTruthy();
  });

  it('reopens on the period the dashboard actually applied', () => {
    const harness = mount({ periodType: 'Quarter', quarter: 2 });
    openPanel(harness);

    expect(rootOf(harness).querySelector('.period-types button.active')?.textContent?.trim()).toBe('Quarter');
    expect((rootOf(harness).querySelector('.period-select') as HTMLSelectElement).value).toBe('2');
  });

  it('closes the popover when the user clicks elsewhere on the page', () => {
    const harness = mount();
    openPanel(harness);

    document.body.click();
    harness.fixture.detectChanges();

    expect(rootOf(harness).querySelector('.period-panel')).toBeNull();
  });

  it('emits the fiscal year when the header year changes', () => {
    const harness = mount();
    const fiscalYear = rootOf(harness).querySelector('#dx-fy') as HTMLSelectElement;
    selectValue(fiscalYear, 'fy-2025');
    harness.fixture.detectChanges();

    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0]).toMatchObject({ fiscalYearId: 'fy-2025', periodType: 'Ytd' });
  });
});
