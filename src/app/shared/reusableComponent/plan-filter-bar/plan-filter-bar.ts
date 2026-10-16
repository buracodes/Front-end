import { Component, computed, inject, input } from '@angular/core';
import { PlanFilterLevel, PlanFilterService } from '../../../core/service/plan-filter.service';

/**
 * The cascading planning filter: fiscal year → scorecard → goal → KRA. A level stays
 * disabled until its parent is chosen, and choosing a value reloads the grid straight
 * away, so there is no apply button.
 */
@Component({
  selector: 'app-plan-filter-bar',
  templateUrl: './plan-filter-bar.html',
  styleUrl: './plan-filter-bar.scss',
})
export class PlanFilterBar {
  readonly filters = inject(PlanFilterService);

  /** Which levels this grid offers, in cascade order. */
  readonly levels = input<PlanFilterLevel[]>(['fiscalYear', 'scorecard', 'goal', 'kra']);

  /**
   * Set by grids that cannot work across fiscal years (targets are per fiscal year). The
   * "all" option is removed and the levels below stay disabled until one is chosen.
   */
  readonly requireFiscalYear = input(false);

  protected readonly shows = computed(() => new Set(this.levels()));

  protected onFiscalYearChange(value: string): void {
    this.filters.selectFiscalYear(value);
  }

  protected onScorecardChange(value: string): void {
    this.filters.selectScorecard(value);
  }

  protected onGoalChange(value: string): void {
    this.filters.selectGoal(value);
  }

  protected onKraChange(value: string): void {
    this.filters.selectKra(value);
  }

  protected onReset(): void {
    this.filters.reset();
  }

  protected get hasSelection(): boolean {
    return !!(this.filters.fiscalYearId() || this.filters.scorecardId() || this.filters.goalId() || this.filters.kraId());
  }
}
