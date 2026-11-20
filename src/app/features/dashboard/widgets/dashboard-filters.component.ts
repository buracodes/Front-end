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
import {
  DashboardFilter,
  DashboardFilterOption,
  DashboardPeriodType,
} from '../role-dashboard.model';

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

interface PeriodChoice {
  value: number;
  label: string;
}

const PANEL_WIDTH = 300;
const PANEL_GAP = 6;
const PANEL_ESTIMATED_HEIGHT = 240;
const VIEWPORT_MARGIN = 12;

/**
 * Global dashboard filters: fiscal year, scorecard and the Scorecards-style
 * "Filter by Period" popover (YTD / Month / Quarter / Year).
 *
 * Every option list still comes from the server; the fiscal-year start date only
 * supplies the month names so the period labels follow the year's own start month.
 * A change re-filters the whole page.
 */
@Component({
  selector: 'app-dashboard-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  templateUrl: './dashboard-filters.component.html',
  styleUrl: './dashboard-filters.component.scss',
})
export class DashboardFiltersComponent {
  readonly filter = input.required<DashboardFilter>();
  readonly fiscalYears = input.required<DashboardFilterOption[]>();
  readonly scorecards = input.required<{ id: string; label: string }[]>();
  readonly scorecardSelectionRequired = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly busy = input<boolean>(false);

  readonly filterChange = output<DashboardFilter>();

  protected readonly current = computed(() => this.filter());
  protected readonly periodOpen = signal(false);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('periodTrigger');
  /** Viewport coordinates for the fixed-position panel, clamped so it never leaves the screen. */
  protected readonly panelPosition = signal({ top: 0, left: 0 });
  /** The tab the user last picked; falls back to the period the dashboard actually applied. */
  private readonly tabOverride = signal<DashboardPeriodType | null>(null);
  protected readonly tab = computed(() => this.tabOverride() ?? this.current().periodType);

  private readonly monthFromDraft = signal<number | null>(null);
  private readonly monthToDraft = signal<number | null>(null);
  private readonly quarterDraft = signal<number | null>(null);

  protected readonly activeFiscalYear = computed(() => {
    const years = this.fiscalYears();
    return (
      years.find((year) => year.id === this.current().fiscalYearId) ??
      years.find((year) => year.isSelected) ??
      years[0] ??
      null
    );
  });

  /** The twelve fiscal months of the active year, in fiscal order and with their calendar names. */
  protected readonly monthOptions = computed<PeriodChoice[]>(() => {
    const start = this.parseStart(this.activeFiscalYear()?.startDate);
    if (!start) {
      return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Month ${i + 1}` }));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const offset = start.monthIndex + i;
      return {
        value: i + 1,
        label: `${SHORT_MONTHS[offset % 12]} ${start.year + Math.floor(offset / 12)}`,
      };
    });
  });

  /** Fiscal quarters labelled with their month span and the year each quarter ends in. */
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
        label: `Q${quarter} (${SHORT_MONTHS[from % 12]} - ${SHORT_MONTHS[to % 12]} ${start.year + Math.floor(to / 12)})`,
      };
    });
  });

  protected readonly monthFrom = computed(() => this.monthFromDraft() ?? this.current().fromMonth);
  protected readonly monthTo = computed(() => this.monthToDraft() ?? this.current().toMonth);
  protected readonly quarter = computed(() => this.quarterDraft() ?? this.current().quarter);

  protected readonly monthRangeInvalid = computed(() => {
    const from = this.monthFrom();
    const to = this.monthTo();
    return from !== null && to !== null && from > to;
  });

  protected readonly hasPeriodFilter = computed(() => this.current().periodType !== 'Ytd');

  protected togglePeriod(): void {
    const open = !this.periodOpen();
    if (open) {
      this.positionPanel();
    }
    this.periodOpen.set(open);
  }

  /**
   * Anchor the panel to the trigger but keep it fully inside the viewport.
   * Fixed positioning (the same approach as the grid row menus) keeps it clear of
   * the sticky topbar, the sidebar and any scrolling container around the filters.
   */
  private positionPanel(): void {
    const trigger = this.trigger()?.nativeElement;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    const fitsBelow = rect.bottom + PANEL_GAP + PANEL_ESTIMATED_HEIGHT <= window.innerHeight;
    const top = fitsBelow ? rect.bottom + PANEL_GAP : rect.top - PANEL_GAP - PANEL_ESTIMATED_HEIGHT;
    this.panelPosition.set({ top: Math.max(VIEWPORT_MARGIN, top), left });
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected onViewportChange(): void {
    if (this.periodOpen()) {
      this.positionPanel();
    }
  }

  protected selectTab(type: DashboardPeriodType): void {
    this.tabOverride.set(type);
    // Switching type drops the previous type's choices, as the Scorecards module does.
    if (type !== 'Month') {
      this.monthFromDraft.set(null);
      this.monthToDraft.set(null);
    }
    if (type !== 'Quarter') {
      this.quarterDraft.set(null);
    }
    if (type === 'Ytd' || type === 'Year') {
      this.emit({ periodType: type, quarter: null, fromMonth: null, toMonth: null });
    }
    // Month and Quarter apply once a value is chosen, exactly like the Scorecards module.
  }

  protected onFiscalYear(value: string): void {
    this.emit({ fiscalYearId: value || null });
  }

  protected onScorecard(value: string): void {
    this.emit({ scorecardId: value || null });
  }

  /** The Year tab's fiscal-year picker: a year change stays inside the yearly period. */
  protected onPeriodFiscalYear(value: string): void {
    this.emit({
      fiscalYearId: value || null,
      periodType: 'Year',
      quarter: null,
      fromMonth: null,
      toMonth: null,
    });
  }

  protected onMonthFrom(event: Event): void {
    this.monthFromDraft.set(this.toMonthValue((event.target as HTMLSelectElement).value));
    this.applyMonthRange();
  }

  protected onMonthTo(event: Event): void {
    this.monthToDraft.set(this.toMonthValue((event.target as HTMLSelectElement).value));
    this.applyMonthRange();
  }

  protected onQuarter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const quarter = value ? Number(value) : null;
    this.quarterDraft.set(quarter);
    if (quarter !== null && quarter >= 1 && quarter <= 4) {
      this.emit({ periodType: 'Quarter', quarter, fromMonth: null, toMonth: null });
    }
  }

  protected clearPeriodFilter(): void {
    this.tabOverride.set('Ytd');
    this.monthFromDraft.set(null);
    this.monthToDraft.set(null);
    this.quarterDraft.set(null);
    this.emit({ periodType: 'Ytd', quarter: null, fromMonth: null, toMonth: null });
  }

  private applyMonthRange(): void {
    const from = this.monthFrom();
    const to = this.monthTo();
    if (from === null || to === null || from > to) {
      return;
    }
    this.emit({ periodType: 'Month', fromMonth: from, toMonth: to, quarter: null });
  }

  private toMonthValue(raw: string): number | null {
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
  }

  private parseStart(startDate: string | null | undefined): { year: number; monthIndex: number } | null {
    const match = /^(\d{4})-(\d{2})/.exec(startDate ?? '');
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) {
      return null;
    }
    return { year, monthIndex };
  }

  private emit(patch: Partial<DashboardFilter>): void {
    this.filterChange.emit({ ...this.filter(), ...patch });
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.period-field')) {
      this.periodOpen.set(false);
    }
  }
}
