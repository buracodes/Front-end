import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import { DashboardWidgetComponent } from './widgets/dashboard-widget.component';
import { DashboardFiltersComponent } from './widgets/dashboard-filters.component';
import { DashboardGoalDrilldownComponent } from './widgets/dashboard-goal-drilldown.component';
import { DashboardWidgetPayload, isEmptyPayload, resolveWidget } from './dashboard-widget-registry';
import { RoleDashboardService } from './role-dashboard.service';
import { LucideDynamicIcon } from '@lucide/angular';
import {
  DashboardFilter,
  DashboardRoleContext,
  DashboardWidgetBundle,
  DashboardWidgetDescriptor,
  GoalDrilldown,
  TableRow,
} from './role-dashboard.model';

/**
 * One dashboard for every role.
 *
 * The page holds no role logic: it asks the server for the role context (filters,
 * quick actions, widget list) and the widget bundle, then renders whatever comes
 * back. Permissions, data scope and RAG are decided on the server, which is why
 * Executive, View Only, Data Entry, Power User and Admin all land on this route.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DashboardFiltersComponent, DashboardWidgetComponent, DashboardGoalDrilldownComponent, LucideDynamicIcon],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage implements OnInit {
  private readonly roleDashboard = inject(RoleDashboardService);
  private readonly notifications = inject(NotificationService);
  readonly userStore = inject(UserStore);

  readonly context = signal<DashboardRoleContext | null>(null);
  readonly bundle = signal<DashboardWidgetBundle | null>(null);
  readonly filter = signal<DashboardFilter>({
    fiscalYearId: null,
    scorecardId: null,
    periodType: 'Ytd',
    quarter: null,
    fromMonth: null,
    toMonth: null,
  });

  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly error = signal<string | null>(null);
  readonly drilldown = signal<GoalDrilldown | null>(null);
  readonly drilldownBusy = signal(false);

  /** Widget descriptors paired with their resolved payload, in server order. */
  readonly widgets = computed<{ descriptor: DashboardWidgetDescriptor; payload: DashboardWidgetPayload | null }[]>(() => {
    const bundle = this.bundle();
    if (!bundle) {
      return [];
    }

    return bundle.widgets.map((descriptor) => ({
      descriptor,
      payload: resolveWidget(bundle, descriptor.key),
    }));
  });

  readonly visibleWidgets = computed(() => this.widgets().filter((entry) => !isEmptyPayload(entry.payload)));

  readonly fiscalYearOptions = computed(() => this.context()?.fiscalYears ?? []);
  readonly scorecardOptions = computed(() => this.context()?.scorecards ?? []);
  readonly periodOptions = computed(() => this.context()?.periods ?? []);
  readonly quickActions = computed(() => this.context()?.quickActions ?? []);
  readonly readOnly = computed(() => this.context()?.readOnly ?? false);
  readonly scopeLabel = computed(() =>
    this.context()?.dataScope === 'AssignedOnly' ? 'Your assignments only' : 'Organization wide'
  );
  readonly appliedPeriod = computed(() => this.bundle()?.filter?.periodLabel ?? this.context()?.filter?.periodLabel ?? 'Year to date');
  readonly fiscalYearClosed = computed(() => this.bundle()?.filter?.fiscalYearClosed ?? false);
  readonly hasWidgets = computed(() => this.visibleWidgets().length > 0);

  /**
   * Only the goal tables carry a goal id as their row id, so they are the rows
   * that open the KRA/KPI drill-down drawer.
   */
  readonly GOAL_WIDGETS = new Set(['goalPerformance', 'goalHealth']);

  get initials(): string {
    const fullName = this.userStore.user()?.fullName ?? '';
    return fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  ngOnInit(): void {
    this.load(true);
  }

  /** Any filter change refilters the whole page - there is no per-widget filtering. */
  onFilterChange(filter: DashboardFilter): void {
    this.filter.set(filter);
    this.load(false);
  }

  isGoalWidget(key: string): boolean {
    return this.GOAL_WIDGETS.has(key);
  }

  onRowNavigate(row: TableRow, widgetKey: string): void {
    if (!this.isGoalWidget(widgetKey) || !row.id) {
      return;
    }

    this.drilldownBusy.set(true);
    this.roleDashboard.getGoalDrilldown(row.id, this.filter()).subscribe({
      next: (goal) => {
        this.drilldown.set(goal);
        this.drilldownBusy.set(false);
      },
      error: (err) => {
        this.drilldownBusy.set(false);
        this.notifications.error(toApiError(err).message);
      },
    });
  }

  closeDrilldown(): void {
    this.drilldown.set(null);
  }

  retry(): void {
    this.load(true);
  }

  private load(initial: boolean): void {
    if (initial) {
      this.loading.set(true);
    } else {
      this.refreshing.set(true);
    }
    this.error.set(null);

    const filter = this.filter();

    forkJoin({
      context: this.roleDashboard.getContext(filter).pipe(
        catchError((err) => {
          this.error.set(toApiError(err).message);
          return of(null);
        })
      ),
      bundle: this.roleDashboard.getWidgets(filter).pipe(
        catchError((err) => {
          this.error.set(toApiError(err).message);
          return of(null);
        })
      ),
    }).subscribe(({ context, bundle }) => {
      if (context) {
        this.context.set(context);
        // The server is authoritative: it may fall back to another scorecard/year.
        this.filter.set({ ...filter, ...pickFilter(context.filter) });
      }
      if (bundle) {
        this.bundle.set(bundle);
      }
      this.loading.set(false);
      this.refreshing.set(false);
    });
  }
}

function pickFilter(applied: DashboardRoleContext['filter']): Partial<DashboardFilter> {
  return {
    fiscalYearId: applied.fiscalYearId,
    scorecardId: applied.scorecardId,
    periodType: applied.periodType as DashboardFilter['periodType'],
    quarter: applied.quarter,
    fromMonth: applied.fromMonth,
    toMonth: applied.toMonth,
  };
}
