import { Component, computed, inject, HostListener, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { ScorecardWorkspaceState } from '../workspace-state.service';
import { scoreColor } from '../workspace-state.service';

import { LucideDynamicIcon } from '@lucide/angular';
interface ModuleTab {
  label: string;
  route?: string;
  available: boolean;
  /** Leaves the workspace and hands its scope to a standalone page, e.g. Targets. */
  carryScope?: boolean;
}

@Component({
  selector: 'app-scorecard-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DecimalPipe, LucideDynamicIcon],
  templateUrl: './scorecard-layout.html',
  styleUrl: './scorecard-layout.scss',
})
export class ScorecardLayout implements OnInit {
  private readonly state = inject(ScorecardWorkspaceState);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly fiscalYears = this.state.fiscalYears;
  readonly scorecards = this.state.scorecards.asReadonly();
  readonly fiscalYearId = this.state.fiscalYearId;
  readonly scorecardId = this.state.scorecardId;
  readonly loading = this.state.loading;
  readonly error = this.state.error;

  readonly selectedFiscalYear = this.state.selectedFiscalYear;
  readonly selectedScorecard = this.state.selectedScorecard;
  readonly isReadOnly = this.state.isReadOnly;
  readonly scorecardClosed = this.state.scorecardClosed;
  readonly fiscalYearClosed = this.state.fiscalYearClosed;
  readonly overallScore = this.state.overallScore;
  readonly overallDelta = this.state.overallDelta;
  readonly goalCount = this.state.scorecardGoals;
  readonly kraCount = this.state.kras;
  readonly kpiCount = this.state.kpis;

  readonly periodFilterOpen = this.state.periodFilterOpen;
  readonly periodType = this.state.periodType;
  readonly quarterFilter = this.state.quarterFilter;
  readonly monthFrom = this.state.monthFrom;
  readonly monthTo = this.state.monthTo;
  readonly hasPeriodFilter = this.state.hasPeriodFilter;
  readonly quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  readonly tabs: ModuleTab[] = [
    { label: 'Strategic Hierarchy', route: 'hierarchy', available: true },
    { label: 'Targets', route: '/targets', available: true, carryScope: true },
    { label: 'Performance', route: 'performance', available: true },
    { label: 'Data Integration', available: false },
    { label: 'Audit Log', available: false },
    { label: 'Settings', available: false },
  ];

  /** Hands the workspace's fiscal year and scorecard to the standalone Targets page. */
  readonly scopeQueryParams = computed<Record<string, string>>(() => {
    const params: Record<string, string> = {};
    if (this.fiscalYearId()) params['fiscalYearId'] = this.fiscalYearId()!;
    if (this.scorecardId()) params['scorecardId'] = this.scorecardId()!;
    return params;
  });

  ngOnInit(): void {
    const requestedId = this.route.snapshot.queryParamMap.get('scorecardId') ?? undefined;
    this.state.loadFiscalYearsAndScorecards(requestedId);
  }

  onFiscalYearChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectFiscalYear(id);
  }

  onScorecardChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectScorecard(id);
  }

  togglePeriodFilter(): void {
    this.state.periodFilterOpen.update((open) => !open);
  }

  setPeriodType(type: 'quarter' | 'month'): void {
    this.state.periodType.set(type);
  }

  onQuarterFilterChange(event: Event): void {
    this.state.quarterFilter.set((event.target as HTMLSelectElement).value);
  }

  onMonthFromChange(event: Event): void {
    this.state.monthFrom.set((event.target as HTMLInputElement).value);
  }

  onMonthToChange(event: Event): void {
    this.state.monthTo.set((event.target as HTMLInputElement).value);
  }

  clearPeriodFilter(): void {
    this.state.quarterFilter.set('');
    this.state.monthFrom.set('');
    this.state.monthTo.set('');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest('.ssc-period-filter')) {
      this.state.periodFilterOpen.set(false);
    }
  }

  goToManagement(): void {
    this.router.navigate(['/scorecards/manage']);
  }

  scoreTone(score: number | null): string {
    return scoreColor(score);
  }
}