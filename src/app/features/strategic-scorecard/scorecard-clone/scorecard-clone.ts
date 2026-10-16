import { Component, computed, effect, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ScorecardService,
} from '../../../core/service/scorecard.service';
import type {
  FiscalYear,
  Scorecard,
  CloneScorecardResult,
} from '../../../core/model/scorecard.model';
import { ScorecardWorkspaceState } from '../workspace-state.service';
import { toApiError } from '../../../core/model/api-error';
import { NotificationService } from '../../../core/service/notification.service';

import { LucideDynamicIcon } from '@lucide/angular';

@Component({
  selector: 'app-scorecard-clone',
  imports: [LucideDynamicIcon],
  templateUrl: './scorecard-clone.html',
  styleUrl: './scorecard-clone.scss',
})
export class ScorecardClonePage implements OnInit {
  private readonly scorecardService = inject(ScorecardService);
  private readonly state = inject(ScorecardWorkspaceState);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly fiscalYears = this.state.fiscalYears;
  readonly scorecards = this.state.scorecards.asReadonly();
  readonly loading = this.state.loading;

  readonly sourceScorecardId = signal<string | null>(null);
  readonly targetFiscalYearId = signal<string | null>(null);
  readonly newName = signal('');
  readonly sourceDetail = signal<Scorecard | null>(null);
  readonly loadingDetail = signal(false);
  readonly cloning = signal(false);
  readonly result = signal<CloneScorecardResult | null>(null);

  readonly source = computed(() =>
    this.scorecards().find((sc) => sc.id === this.sourceScorecardId()) ?? null
  );

  readonly targetYear = computed(() =>
    this.fiscalYears().find((fy) => fy.id === this.targetFiscalYearId()) ?? null
  );

  readonly proposedName = computed(() => (this.newName().trim() || this.source()?.name || '').trim());

  readonly nameTaken = computed(() => {
    const name = this.proposedName();
    const targetFy = this.targetFiscalYearId();
    if (!name || !targetFy) return false;
    return this.scorecards().some(
      (sc) => sc.fiscalYearId === targetFy && sc.name.toLowerCase() === name.toLowerCase()
    );
  });

  readonly sameFiscalYear = computed(() => {
    const src = this.source();
    const targetFy = this.targetFiscalYearId();
    return !!src && !!targetFy && src.fiscalYearId === targetFy;
  });

  readonly canClone = computed(
    () =>
      !!this.source() &&
      !!this.targetFiscalYearId() &&
      !this.nameTaken() &&
      !this.cloning() &&
      !!this.proposedName()
  );

  constructor() {
    effect(() => {
      const id = this.sourceScorecardId();
      if (!id) return;
      this.loadingDetail.set(true);
      this.scorecardService.getById(id).subscribe({
        next: (detail) => {
          this.sourceDetail.set(detail);
          this.loadingDetail.set(false);
        },
        error: () => {
          this.sourceDetail.set(null);
          this.loadingDetail.set(false);
        },
      });
    });
  }

  ngOnInit(): void {
    this.state.loadFiscalYearsAndScorecards();
  }

  onSourceChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.sourceScorecardId.set(id);
    this.result.set(null);
  }

  onTargetChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.targetFiscalYearId.set(id);
    this.result.set(null);
  }

  onNameInput(value: string): void {
    this.newName.set(value);
    this.result.set(null);
  }

  clearResult(): void {
    this.result.set(null);
  }

  targetYearCandidates(): FiscalYear[] {
    const src = this.source();
    return this.fiscalYears().filter((fy) => !src || fy.id !== src.fiscalYearId);
  }

  sourceFiscalYearLabel(): string {
    const fy = this.fiscalYears().find((f) => f.id === this.source()?.fiscalYearId);
    return fy?.label ?? '—';
  }

  cloneCounts(): string[] {
    const detail = this.sourceDetail() ?? this.source();
    const parts = [`${detail?.goalCount ?? '?'} Goals`, `${detail?.kraCount ?? '?'} KRAs`, `${detail?.kpiCount ?? '?'} KPIs`];
    return parts;
  }

  clone(): void {
    const sourceId = this.sourceScorecardId();
    const targetFy = this.targetFiscalYearId();
    if (!sourceId || !targetFy || !this.canClone()) return;

    this.cloning.set(true);
    this.scorecardService.clone(sourceId, targetFy, this.newName().trim() || undefined).subscribe({
      next: (res) => {
        this.cloning.set(false);
        this.result.set(res);
        const copied: Scorecard = {
          id: res.targetScorecardId,
          fiscalYearId: res.targetFiscalYearId,
          name: res.name,
          scorecardStatus: 'Active',
          scope: this.source()?.scope ?? 'Corporate',
          goalCount: res.goalCount,
          kraCount: res.kraCount,
          kpiCount: res.kpiCount,
        };
        this.state.scorecards.update((list) => [...list, copied]);
        this.state.selectScorecard(copied.id);
        this.state.reloadLocks();
        this.notifications.success(`Cloned '${this.source()?.name}' into ${this.targetYear()?.label ?? ''} as '${res.name}'.`);
      },
      error: (err) => {
        this.cloning.set(false);
        this.notifications.error(toApiError(err).message);
      },
    });
  }

  openClonedScorecard(): void {
    this.router.navigate(['/scorecards']);
  }
}