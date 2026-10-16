import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardFilter, DashboardPeriodType } from '../role-dashboard.model';

/**
 * The three global filters from the FRD. Every option list comes from the server
 * (context endpoint) so the shell never invents a fiscal year, scorecard or
 * period; a change re-filters the whole page.
 */
@Component({
  selector: 'app-dashboard-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './dashboard-filters.component.html',
  styleUrl: './dashboard-filters.component.scss',
})
export class DashboardFiltersComponent {
  readonly filter = input.required<DashboardFilter>();
  readonly fiscalYears = input.required<{ id: string; label: string }[]>();
  readonly scorecards = input.required<{ id: string; label: string }[]>();
  readonly periods = input.required<{ value: string; label: string }[]>();
  readonly disabled = input<boolean>(false);
  readonly busy = input<boolean>(false);

  readonly filterChange = output<DashboardFilter>();

  protected readonly current = computed(() => this.filter());
  protected readonly monthOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  protected monthName(month: number): string {
    return new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  }

  protected onFiscalYear(value: string): void {
    this.emit({ fiscalYearId: value || null });
  }

  protected onScorecard(value: string): void {
    this.emit({ scorecardId: value || null });
  }

  protected onPeriod(value: string): void {
    if (!value) {
      return;
    }
    this.emit({ periodType: value as DashboardPeriodType, quarter: null, fromMonth: null, toMonth: null });
  }

  protected onQuarter(value: string): void {
    this.emit({ quarter: value ? Number(value) : null, fromMonth: null, toMonth: null });
  }

  protected onMonthFrom(value: string): void {
    this.emit({ fromMonth: value ? Number(value) : null });
  }

  protected onMonthTo(value: string): void {
    this.emit({ toMonth: value ? Number(value) : null });
  }

  private emit(patch: Partial<DashboardFilter>): void {
    this.filterChange.emit({ ...this.filter(), ...patch });
  }
}
