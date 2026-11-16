import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { FiscalYear } from '../../core/model/scorecard.model';
import { fiscalMonthLabel } from '../strategic-scorecard/workspace-state.service';

export type DivisionPeriodMode = 'Ytd' | 'Month' | 'Quarter' | 'Year';

/** FR-908: the period scope applied to the division plan and its report. */
export interface DivisionPeriodFilter {
  type: DivisionPeriodMode;
  /** Month tab, 1-12 fiscal months. */
  fromMonth?: number;
  toMonth?: number;
  /** Quarter tab, 1-4. */
  quarter?: number;
  /** Year tab: the fiscal year to load. */
  fiscalYearId?: string;
}

interface PeriodChoice {
  value: number;
  label: string;
}

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Button-triggered "Filter by Period" panel for Division Planning: YTD, a custom
 * fiscal-month range, a fiscal quarter or a full fiscal year. Labels follow the
 * fiscal year's own start month, so a July-start year reads Jul…Jun with its real
 * calendar names.
 */
@Component({
  selector: 'app-division-period-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, NgClass],
  templateUrl: './division-period-filter.component.html',
  styleUrl: './division-period-filter.component.scss',
})
export class DivisionPeriodFilterComponent {
  protected readonly tabs: Array<{ value: DivisionPeriodMode; label: string }> = [
    { value: 'Ytd', label: 'YTD' },
    { value: 'Month', label: 'Month' },
    { value: 'Quarter', label: 'Quarter' },
    { value: 'Year', label: 'Year' },
  ];

  readonly filter = input.required<DivisionPeriodFilter>();
  readonly fiscalYears = input.required<FiscalYear[]>();
  /** Fiscal year the open division plan belongs to; labels and the Year default use it. */
  readonly currentFiscalYearId = input<string | null>(null);
  readonly disabled = input<boolean>(false);

  readonly filterChange = output<DivisionPeriodFilter>();

  private readonly container = viewChild<ElementRef<HTMLElement>>('container');

  protected readonly open = signal(false);
  /** The tab the user is browsing; falls back to the applied filter's mode. */
  private readonly tabOverride = signal<DivisionPeriodMode | null>(null);
  protected readonly tab = computed(() => this.tabOverride() ?? this.filter().type);

  private readonly fromDraft = signal<number | null>(null);
  private readonly toDraft = signal<number | null>(null);
  /** True when the user explicitly cleared "To Month" to report a single month. */
  private readonly toCleared = signal(false);
  private readonly quarterDraft = signal<number | null>(null);

  protected readonly activeFiscalYear = computed(() => {
    const years = this.fiscalYears();
    const wanted = this.filter().type === 'Year' ? this.filter().fiscalYearId : this.currentFiscalYearId();
    return years.find((year) => year.id === wanted) ?? years[0] ?? null;
  });

  /** The twelve fiscal months in fiscal order, labelled with their calendar month and year. */
  protected readonly monthOptions = computed<PeriodChoice[]>(() => {
    const start = this.parseStart(this.activeFiscalYear()?.startDate);
    if (!start) {
      return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Month ${i + 1}` }));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const offset = start.monthIndex + i;
      return {
        value: i + 1,
        label: `${LONG_MONTHS[offset % 12]} ${start.year + Math.floor(offset / 12)}`,
      };
    });
  });

  /** Quarters with their exact fiscal span, e.g. "Q1 (July – September 2026)". */
  protected readonly quarterOptions = computed<PeriodChoice[]>(() => {
    const start = this.parseStart(this.activeFiscalYear()?.startDate);
    return [1, 2, 3, 4].map((quarter) => {
      if (!start) {
        return { value: quarter, label: `Q${quarter}` };
      }
      const from = start.monthIndex + (quarter - 1) * 3;
      const to = from + 2;
      return {
        value: quarter,
        label: `Q${quarter} (${LONG_MONTHS[from % 12]} – ${LONG_MONTHS[to % 12]} ${start.year + Math.floor(to / 12)})`,
      };
    });
  });

  /** Full four-digit fiscal-year labels, e.g. "2026/2027". */
  protected readonly yearOptions = computed(() =>
    this.fiscalYears().map((year) => ({ id: year.id, label: this.yearLabel(year) }))
  );

  protected readonly monthFrom = computed(() => this.fromDraft() ?? this.applied('fromMonth'));
  protected readonly monthTo = computed(() =>
    this.toCleared() ? null : this.toDraft() ?? this.applied('toMonth')
  );
  protected readonly quarter = computed(() => this.quarterDraft() ?? this.applied('quarter'));
  protected readonly selectedYearId = computed(() => {
    const filter = this.filter();
    return (filter.type === 'Year' ? filter.fiscalYearId : null) ?? this.currentFiscalYearId() ?? '';
  });

  protected readonly monthRangeInvalid = computed(() => {
    const from = this.monthFrom();
    const to = this.monthTo();
    return from !== null && to !== null && from > to;
  });

  /** The applied and draft state is always a real filter: only YTD is "no filter". */
  protected readonly active = computed(() => this.filter().type !== 'Ytd');

  protected readonly summary = computed(() => {
    const filter = this.filter();
    switch (filter.type) {
      case 'Month': {
        if (!filter.fromMonth) return 'Custom months';
        const to = filter.toMonth ?? filter.fromMonth;
        if (to === filter.fromMonth) return this.monthLabel(filter.fromMonth);
        return `${this.monthLabel(filter.fromMonth)} – ${this.monthLabel(to)}`;
      }
      case 'Quarter':
        return filter.quarter ? `Q${filter.quarter} · ${this.quarterSpan(filter.quarter)}` : 'Quarter';
      case 'Year': {
        const year = this.fiscalYears().find((candidate) => candidate.id === filter.fiscalYearId);
        return year ? this.yearLabel(year) : 'Fiscal year';
      }
      default:
        return 'YTD';
    }
  });

  protected toggle(): void {
    if (this.disabled()) return;
    this.open.update((value) => !value);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected selectTab(type: DivisionPeriodMode): void {
    this.tabOverride.set(type);
    if (type !== 'Month') {
      this.fromDraft.set(null);
      this.toDraft.set(null);
      this.toCleared.set(false);
    }
    if (type !== 'Quarter') {
      this.quarterDraft.set(null);
    }
    if (type === 'Ytd') {
      this.emit({ type: 'Ytd' });
    }
    // Month and Quarter apply once both/one value is chosen, exactly like the dashboard.
  }

  protected onMonthFrom(value: string): void {
    this.fromDraft.set(this.monthValue(value));
    this.applyMonthRange();
  }

  protected onMonthTo(value: string): void {
    const month = this.monthValue(value);
    this.toDraft.set(month);
    this.toCleared.set(month === null);
    this.applyMonthRange();
  }

  protected onQuarter(value: string): void {
    const quarter = Number(value);
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
      this.quarterDraft.set(null);
      return;
    }
    this.quarterDraft.set(quarter);
    this.emit({ type: 'Quarter', quarter });
  }

  protected onYear(value: string): void {
    if (!value) return;
    this.emit({ type: 'Year', fiscalYearId: value });
  }

  protected clear(): void {
    this.tabOverride.set('Ytd');
    this.fromDraft.set(null);
    this.toDraft.set(null);
    this.toCleared.set(false);
    this.quarterDraft.set(null);
    this.emit({ type: 'Ytd' });
  }

  /** A lone From Month is a single-month filter; To Month is optional. */
  private applyMonthRange(): void {
    const from = this.monthFrom();
    if (from === null) return;
    const to = this.monthTo();
    if (to !== null && from > to) return;
    this.emit({ type: 'Month', fromMonth: from, ...(to !== null ? { toMonth: to } : {}) });
  }

  private emit(filter: DivisionPeriodFilter): void {
    this.filterChange.emit(filter);
  }

  private applied(key: 'fromMonth' | 'toMonth' | 'quarter'): number | null {
    const filter = this.filter();
    if (filter.type === 'Month' && (key === 'fromMonth' || key === 'toMonth')) {
      return filter[key] ?? null;
    }
    if (filter.type === 'Quarter' && key === 'quarter') {
      return filter.quarter ?? null;
    }
    return null;
  }

  private monthLabel(fiscalMonth: number): string {
    const fy = this.activeFiscalYear();
    if (!fy?.startDate) return `Month ${fiscalMonth}`;
    const label = fiscalMonthLabel(fy.startDate, fiscalMonth, true);
    const start = this.parseStart(fy.startDate);
    if (!start) return label;
    const offset = start.monthIndex + fiscalMonth - 1;
    return `${label} ${start.year + Math.floor(offset / 12)}`;
  }

  private quarterSpan(quarter: number): string {
    const start = this.parseStart(this.activeFiscalYear()?.startDate);
    if (!start) return '';
    const from = start.monthIndex + (quarter - 1) * 3;
    const to = from + 2;
    return `${LONG_MONTHS[from % 12]} – ${LONG_MONTHS[to % 12]} ${start.year + Math.floor(to / 12)}`;
  }

  private yearLabel(year: FiscalYear): string {
    const start = this.parseStart(year.startDate);
    return start ? `${start.year}/${start.year + 1}` : year.label;
  }

  private monthValue(raw: string): number | null {
    const value = Number(raw);
    return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
  }

  private parseStart(startDate: string | null | undefined): { year: number; monthIndex: number } | null {
    const match = /^(\d{4})-(\d{2})/.exec(startDate ?? '');
    if (!match) return null;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
    return { year, monthIndex };
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const host = this.container()?.nativeElement;
    if (host && !host.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open()) this.open.set(false);
  }
}
