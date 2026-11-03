import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PerformanceMonitoringService } from './performance-monitoring.service';
import { PerformanceMonitoring } from './performance-monitoring.model';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';
import { ScorecardService } from '../../core/service/scorecard.service';
import { FiscalYearService } from '../fiscal-year/fiscal-year.service';
import { FiscalYear } from '../fiscal-year/fiscal-year.model';
import { DivisionService } from '../division/division.service';
import { Division } from '../division/division.model';
import { Scorecard } from '../../core/model/scorecard.model';
import { UserStore } from '../../core/service/user-store.service';
import { LucideDynamicIcon } from '@lucide/angular';

/** View modes for the scorecard-scope selector. "All Authorized" is the corporate view with the division comparison. */
export type PerformanceScopeMode = 'all' | 'corporate' | 'division';

@Component({
  selector: 'app-performance-monitoring',
  imports: [DecimalPipe, FormsModule, LucideDynamicIcon],
  templateUrl: './performance-monitoring.html',
  styleUrl: './performance-monitoring.scss',
})
export class PerformanceMonitoringPage {
  private readonly service = inject(PerformanceMonitoringService);
  private readonly scorecardService = inject(ScorecardService);
  private readonly fiscalYearService = inject(FiscalYearService);
  private readonly divisionService = inject(DivisionService);
  private readonly notifications = inject(NotificationService);
  private readonly userStore = inject(UserStore);

  readonly loading = signal(false);
  readonly data = signal<PerformanceMonitoring | null>(null);

  readonly fiscalYears = signal<FiscalYear[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly divisions = signal<Division[]>([]);

  readonly fiscalYearId = signal<string>('');
  readonly scorecardId = signal<string>('');
  readonly divisionId = signal<string>('');
  readonly periodType = signal<string>('Ytd');
  readonly scopeMode = signal<PerformanceScopeMode>('all');

  /** Corporate-wide monitoring requires the explicit permission (not "no division assigned"). */
  readonly canViewCorporate = computed(() => this.userStore.hasPermission('performance:monitor.view'));
  readonly canPickDivision = computed(() => this.canViewCorporate() && this.scopeMode() === 'division');
  readonly isCorporate = computed(() => (this.data()?.scope ?? '').toLowerCase() === 'corporate');
  readonly hasData = computed(() => !!this.data()?.fiscalYearId);

  /** Only corporate scorecards have division plans; the selector stays within the chosen fiscal year. */
  readonly selectableScorecards = computed(() => {
    const fy = this.fiscalYearId();
    return this.scorecards().filter(
      (s) =>
        (!fy || s.fiscalYearId === fy) &&
        (String(s.scope ?? '').toLowerCase() === 'corporate'),
    );
  });

  constructor() {
    this.loadFilters();
    this.load();
  }

  loadFilters(): void {
    this.fiscalYearService.getAll().subscribe({
      next: (years) => this.fiscalYears.set(years),
      error: () => this.fiscalYears.set([]),
    });
    // The scorecard picker is a corporate capability. A division employee keeps the
    // scorecard the server resolves from their own division plan.
    if (this.canViewCorporate() || this.userStore.hasPermission('scorecard:view')) {
      this.scorecardService.getAll().subscribe({
        next: (scorecards) => this.scorecards.set(scorecards),
        error: () => this.scorecards.set([]),
      });
    }
    if (this.canViewCorporate()) {
      this.divisionService.getAll().subscribe({
        next: (divs) => this.divisions.set(divs),
        error: () => this.divisions.set([]),
      });
    }
  }

  load(): void {
    this.loading.set(true);
    this.service
      .get({
        fiscalYearId: this.fiscalYearId() || undefined,
        scorecardId: this.scorecardId() || undefined,
        divisionId: this.divisionId() || undefined,
        periodType: this.periodType(),
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          if (res.fiscalYearId && !this.fiscalYearId()) this.fiscalYearId.set(res.fiscalYearId);
          if (res.scorecardId && !this.scorecardId()) this.scorecardId.set(res.scorecardId);
          if (res.divisionId && !this.divisionId()) this.divisionId.set(res.divisionId);
          this.loading.set(false);
        },
        error: (err) => {
          this.notifications.error(toApiError(err).message);
          this.loading.set(false);
        },
      });
  }

  onFilterChange(): void {
    this.load();
  }

  /** A scorecard belongs to exactly one fiscal year; clear a stale selection instead of
   *  letting the server reject the combination. */
  onFiscalYearChange(): void {
    const fiscalYear = this.fiscalYearId();
    const selected = this.scorecards().find((s) => s.id === this.scorecardId());
    if (selected && fiscalYear && selected.fiscalYearId !== fiscalYear) {
      this.scorecardId.set('');
    }
    this.load();
  }

  onScopeModeChange(mode: PerformanceScopeMode): void {
    this.scopeMode.set(mode);
    if (mode === 'division') {
      if (!this.divisionId() && this.divisions().length) {
        this.divisionId.set(this.divisions()[0].id);
      }
    } else {
      this.divisionId.set('');
    }
    this.load();
  }

  drillDown(divisionId: string): void {
    this.scopeMode.set('division');
    this.divisionId.set(divisionId);
    this.load();
  }

  refresh(): void {
    this.load();
  }

  ragClass(rag?: string | null): string {
    const r = (rag ?? '').toLowerCase();
    if (r === 'green') return 'rag-green';
    if (r === 'amber') return 'rag-amber';
    if (r === 'red') return 'rag-red';
    return 'rag-gray';
  }
}
