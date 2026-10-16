import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { FiscalYear, Scorecard } from '../model/scorecard.model';
import { Goal } from '../model/goal.model';
import { ScorecardService } from './scorecard.service';
import { GoalService } from './goal.service';
import { Kra } from '../../features/kra/kra.model';
import { KraService } from '../../features/kra/kra.service';

export type PlanFilterLevel = 'fiscalYear' | 'scorecard' | 'goal' | 'kra';

/** A hierarchy restored from the URL, e.g. a Configure Target deep link. */
export interface PlanFilterSelection {
  fiscalYearId?: string | null;
  scorecardId?: string | null;
  goalId?: string | null;
  kraId?: string | null;
}

/**
 * The cascading filter shared by the planning grids (fiscal year → scorecard → goal → KRA).
 * Selecting a level clears the levels below it, reloads their options and then notifies
 * subscribers through {@link applies} so the open grid reloads itself: there is no apply
 * button, the grid always shows the current selection.
 */
@Injectable({ providedIn: 'root' })
export class PlanFilterService {
  private readonly scorecardService = inject(ScorecardService);
  private readonly goalService = inject(GoalService);
  private readonly kraService = inject(KraService);

  readonly fiscalYearId = signal('');
  readonly scorecardId = signal('');
  readonly goalId = signal('');
  readonly kraId = signal('');

  /** Every scorecard, used by the create/edit forms. */
  readonly allScorecards = signal<Scorecard[]>([]);
  /** Options narrowed to the selected fiscal year, used by the filter bar. */
  readonly fiscalYears = signal<FiscalYear[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly goals = signal<Goal[]>([]);
  readonly kras = signal<Kra[]>([]);

  /** Emits after every accepted change, once the downstream selections have been reset. */
  readonly applies = new Subject<void>();

  private fiscalYearRequest = 0;
  private scorecardRequest = 0;
  private goalRequest = 0;
  private kraRequest = 0;

  /** Load the option lists. Safe to call more than once; the last call wins. */
  loadOptions(): void {
    const fiscalYears = ++this.fiscalYearRequest;
    this.scorecardService.getFiscalYears().subscribe({
      next: (years) => {
        if (fiscalYears !== this.fiscalYearRequest) return;
        this.fiscalYears.set([...years].sort((a, b) => b.startDate.localeCompare(a.startDate)));
      },
      error: () => {
        if (fiscalYears === this.fiscalYearRequest) this.fiscalYears.set([]);
      },
    });

    const scorecards = ++this.scorecardRequest;
    this.scorecardService.getAll().subscribe({
      next: (list) => {
        if (scorecards !== this.scorecardRequest) return;
        this.allScorecards.set(list);
        this.scopeScorecards();
      },
      error: () => {
        if (scorecards === this.scorecardRequest) this.allScorecards.set([]);
      },
    });
  }

  /**
   * Applies a scorecard coming from the URL (scorecard management links into these grids)
   * and keeps the rest of the cascade consistent with it.
   */
  applyScorecard(scorecardId: string): void {
    this.fiscalYearId.set('');
    this.scorecardId.set(scorecardId.trim());
    this.goalId.set('');
    this.kraId.set('');
    this.scopeScorecards();
    this.loadGoals();
    this.kras.set([]);
    this.applies.next();
  }

  /**
   * Restores a full hierarchy from the URL, which is what a row's Configure Target link
   * passes. {@link applyScorecard} cannot be reused here because it deliberately clears the
   * fiscal year, so the levels are set in one pass and then reloaded top down.
   */
  applyHierarchy(selection: PlanFilterSelection): void {
    this.fiscalYearId.set((selection.fiscalYearId ?? '').trim());
    this.scorecardId.set((selection.scorecardId ?? '').trim());
    this.goalId.set((selection.goalId ?? '').trim());
    this.kraId.set((selection.kraId ?? '').trim());
    this.scopeScorecards();
    this.loadGoals();
    this.loadKras();
    this.applies.next();
  }

  selectFiscalYear(fiscalYearId: string): void {
    this.fiscalYearId.set(fiscalYearId);
    this.scorecardId.set('');
    this.goalId.set('');
    this.kraId.set('');
    this.scopeScorecards();
    this.goals.set([]);
    this.kras.set([]);
    this.applies.next();
  }

  selectScorecard(scorecardId: string): void {
    this.scorecardId.set(scorecardId);
    this.goalId.set('');
    this.kraId.set('');
    this.goals.set([]);
    this.loadGoals();
    this.kras.set([]);
    this.applies.next();
  }

  selectGoal(goalId: string): void {
    this.goalId.set(goalId);
    this.kraId.set('');
    this.kras.set([]);
    this.loadKras();
    this.applies.next();
  }

  selectKra(kraId: string): void {
    this.kraId.set(kraId);
    this.applies.next();
  }

  reset(): void {
    this.selectFiscalYear('');
  }

  /** `Name · 2025 FY` for the current scorecard, or an em dash when it cannot be resolved. */
  scorecardLabel(scorecardId: string): string {
    const scorecard = this.allScorecards().find((sc) => sc.id === scorecardId);
    if (!scorecard) return '—';
    return scorecard.fiscalYearName ? `${scorecard.name} · ${scorecard.fiscalYearName}` : scorecard.name;
  }

  private scopeScorecards(): void {
    const fiscalYearId = this.fiscalYearId();
    const all = this.allScorecards();
    this.scorecards.set(fiscalYearId ? all.filter((sc) => sc.fiscalYearId === fiscalYearId) : all);
  }

  private loadGoals(): void {
    const request = ++this.goalRequest;
    const scorecardId = this.scorecardId();
    if (!scorecardId) {
      this.goals.set([]);
      return;
    }
    this.goalService.getByScorecard(scorecardId).subscribe({
      next: (goals) => {
        if (request === this.goalRequest) this.goals.set(goals);
      },
      error: () => {
        if (request === this.goalRequest) this.goals.set([]);
      },
    });
  }

  private loadKras(): void {
    const request = ++this.kraRequest;
    const goalId = this.goalId();
    if (!goalId) {
      this.kras.set([]);
      return;
    }
    this.kraService.getAll(undefined, goalId).subscribe({
      next: (kras) => {
        if (request === this.kraRequest) this.kras.set(kras);
      },
      error: () => {
        if (request === this.kraRequest) this.kras.set([]);
      },
    });
  }
}
