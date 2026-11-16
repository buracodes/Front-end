import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DivisionPeriodFilter,
  DivisionPeriodFilterComponent,
} from './division-period-filter.component';
import { FiscalYear } from '../../core/model/scorecard.model';

const YEARS: FiscalYear[] = [
  { id: 'fy-2', label: '2026/27', startDate: '2026-07-01', endDate: '2027-06-30', status: 'Open' },
  { id: 'fy-1', label: '2025/26', startDate: '2025-07-01', endDate: '2026-06-30', status: 'Closed' },
];

interface Harness {
  fixture: ComponentFixture<DivisionPeriodFilterComponent>;
  emitted: DivisionPeriodFilter[];
}

function mount(filter: DivisionPeriodFilter = { type: 'Ytd' }): Harness {
  const fixture = TestBed.createComponent(DivisionPeriodFilterComponent);
  fixture.componentRef.setInput('filter', filter);
  fixture.componentRef.setInput('fiscalYears', YEARS);
  fixture.componentRef.setInput('currentFiscalYearId', 'fy-2');

  const emitted: DivisionPeriodFilter[] = [];
  fixture.componentInstance.filterChange.subscribe((value) => emitted.push(value));

  fixture.detectChanges();
  return { fixture, emitted };
}

function rootOf(harness: Harness): HTMLElement {
  return harness.fixture.nativeElement as HTMLElement;
}

function openPanel(harness: Harness): void {
  (rootOf(harness).querySelector('.period-trigger') as HTMLButtonElement).click();
  harness.fixture.detectChanges();
}

function clickTab(harness: Harness, label: string): void {
  const button = Array.from(rootOf(harness).querySelectorAll<HTMLButtonElement>('.period-tab')).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) throw new Error(`Tab ${label} not found`);
  button.click();
  harness.fixture.detectChanges();
}

function choose(harness: Harness, select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
  harness.fixture.detectChanges();
}

describe('DivisionPeriodFilterComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DivisionPeriodFilterComponent] }).compileComponents();
  });

  it('opens the panel from the Filter by Period button', () => {
    const harness = mount();
    expect(rootOf(harness).querySelector('.period-panel')).toBeNull();

    openPanel(harness);

    expect(rootOf(harness).querySelector('.period-panel')).toBeTruthy();
    expect(rootOf(harness).querySelector('.period-trigger')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('describes YTD and clears back to it', () => {
    const harness = mount({ type: 'Quarter', quarter: 2 });
    openPanel(harness);

    clickTab(harness, 'YTD');
    expect(rootOf(harness).querySelector('.period-hint')?.textContent).toContain(
      'Shows Year-to-Date (fiscal year start to current period)'
    );
    expect(harness.emitted).toContainEqual({ type: 'Ytd' });

    (rootOf(harness).querySelector('.period-clear') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    expect(harness.emitted[harness.emitted.length - 1]).toEqual({ type: 'Ytd' });
  });

  it('lists fiscal quarters with their exact date ranges', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Quarter');

    const select = rootOf(harness).querySelector('.quarter-select') as HTMLSelectElement;
    const labels = Array.from(select.options).map((option) => option.textContent?.trim());
    expect(labels).toContain('Q1 (July – September 2026)');
    expect(labels).toContain('Q4 (April – June 2027)');
  });

  it('emits the selected quarter', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Quarter');

    choose(harness, rootOf(harness).querySelector('.quarter-select') as HTMLSelectElement, '2');

    expect(harness.emitted).toContainEqual({ type: 'Quarter', quarter: 2 });
  });

  it('labels fiscal months in fiscal order and emits a month range', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Month');

    const from = rootOf(harness).querySelector('.month-from') as HTMLSelectElement;
    const to = rootOf(harness).querySelector('.month-to') as HTMLSelectElement;
    expect(Array.from(from.options).map((option) => option.textContent)).toContain('July 2026');

    choose(harness, from, '3');
    choose(harness, to, '5');

    expect(harness.emitted).toContainEqual({ type: 'Month', fromMonth: 3, toMonth: 5 });
  });

  it('rejects an inverted month range without emitting', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Month');

    choose(harness, rootOf(harness).querySelector('.month-from') as HTMLSelectElement, '8');
    const emittedBefore = harness.emitted.length;
    choose(harness, rootOf(harness).querySelector('.month-to') as HTMLSelectElement, '3');

    expect(harness.emitted.length).toBe(emittedBefore);
    expect(rootOf(harness).textContent).toContain('From month must be before or equal to To month.');
  });

  it('applies a single month when only From Month is chosen', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Month');

    choose(harness, rootOf(harness).querySelector('.month-from') as HTMLSelectElement, '3');

    expect(harness.emitted).toContainEqual({ type: 'Month', fromMonth: 3 });
  });

  it('shows the applied period inside the trigger badge', () => {
    const harness = mount({ type: 'Month', fromMonth: 3 });

    const badge = rootOf(harness).querySelector('[data-testid="period-badge"]');
    expect(badge?.textContent).toContain('September 2026');
    expect(rootOf(harness).querySelector('.period-trigger')?.textContent).toContain('Filter by Period:');
  });

  it('offers full fiscal-year labels and emits the chosen year', () => {
    const harness = mount();
    openPanel(harness);
    clickTab(harness, 'Year');

    const select = rootOf(harness).querySelector('.year-select') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      '2026/2027',
      '2025/2026',
    ]);

    choose(harness, select, 'fy-1');
    expect(harness.emitted).toContainEqual({ type: 'Year', fiscalYearId: 'fy-1' });
  });
});
