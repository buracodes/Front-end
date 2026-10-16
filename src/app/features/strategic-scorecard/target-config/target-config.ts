import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { KPIService } from '../../../core/service/kpi.service';
import { ScorecardService } from '../../../core/service/scorecard.service';
import { Scorecard, FiscalYear } from '../../../core/model/scorecard.model';
import { KPI, SetKpiTargetsRequest } from '../../../core/model/goal.model';
import { NotificationService } from '../../../core/service/notification.service';
import { fiscalMonthLabel, isFiscalYearClosed } from '../workspace-state.service';

const round = (n: number): number => Math.round(n * 100) / 100;

@Component({
  selector: 'app-target-config',
  imports: [],
  templateUrl: './target-config.html',
  styleUrl: './target-config.scss',
})
export class TargetConfigPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly kpiService = inject(KPIService);
  private readonly scorecardService = inject(ScorecardService);
  private readonly notifications = inject(NotificationService);

  readonly quarterIndexes = [0, 1, 2, 3];

  readonly kpi = signal<KPI | null>(null);
  readonly scorecard = signal<Scorecard | null>(null);
  readonly fiscalYear = signal<FiscalYear | null>(null);
  readonly fiscalYears = signal<FiscalYear[]>([]);
  readonly fiscalYearIdResolved = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saved = signal(false);

  readonly annualTarget = signal<number | null>(null);
  readonly quarterly = signal<number[]>([0, 0, 0, 0]);
  readonly monthly = signal<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  readonly autoCalc = signal(false);

  readonly isCumulative = computed(() => this.kpi()?.isCumulative === true);

  /** FR-703: targets of a closed or ended fiscal year are read-only. */
  readonly isReadOnly = computed(() => isFiscalYearClosed(this.fiscalYear()));

  private kpiId = '';
  private requestedScorecardId = '';
  private requestedFiscalYearId = '';
  private scorecardList: Scorecard[] = [];
  private kpiLoaded = false;
  private scorecardsLoaded = false;
  private fiscalYearsLoaded = false;
  /** Set by any of the three parallel loads, so a failure is not overwritten by a later success. */
  private failed = false;

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const kpiId = qp.get('kpiId');

    if (!kpiId) {
      this.loading.set(false);
      this.loadError.set('Missing KPI id.');
      return;
    }

    this.kpiId = kpiId;
    this.requestedScorecardId = qp.get('scorecardId')?.trim() ?? '';
    this.requestedFiscalYearId = qp.get('fiscalYearId')?.trim() ?? '';

    // KPI detail, scorecards and fiscal years load in parallel; the scorecard and the
    // fiscal year are only resolved once all of them have arrived, and the target values
    // load once the fiscal year is known.
    this.kpiService.getById(kpiId).subscribe({
      next: (kpi) => {
        this.kpi.set(kpi);
        this.kpiLoaded = true;
        this.resolveScorecard();
      },
      error: () => {
        this.failed = true;
        this.loading.set(false);
        this.loadError.set('Failed to load KPI details.');
      },
    });

    this.scorecardService.getAll().subscribe({
      next: (list) => {
        this.scorecardList = list;
        this.scorecardsLoaded = true;
        this.resolveScorecard();
      },
      error: () => {
        this.failed = true;
        this.loading.set(false);
        this.loadError.set('Failed to load scorecards.');
      },
    });

    this.scorecardService.getFiscalYears().subscribe({
      next: (fys) => {
        this.fiscalYears.set([...fys].sort((a, b) => b.startDate.localeCompare(a.startDate)));
        this.fiscalYearsLoaded = true;
        this.tryResolveFiscalYear();
      },
      error: () => {
        this.failed = true;
        this.loading.set(false);
        this.loadError.set('Failed to load fiscal years.');
      },
    });
  }

  /**
   * Picks the scorecard only once both the KPI and the scorecard list are known, so the
   * KPI's own scorecard is never lost to whichever request happened to finish first.
   */
  private resolveScorecard(): void {
    if (this.failed || !this.kpiLoaded || !this.scorecardsLoaded) return;

    const list = this.scorecardList;
    this.scorecard.set(
      list.find((s) => s.id === this.requestedScorecardId) ??
        list.find((s) => s.id === this.kpi()?.scorecardId) ??
        list[0] ??
        null,
    );
    this.tryResolveFiscalYear();
  }

  /**
   * Runs once the KPI, the scorecards and the fiscal years have all arrived, whichever
   * finishes last. The fiscal year falls back to the scorecard's year, so it cannot be
   * decided before the KPI is known.
   */
  private tryResolveFiscalYear(): void {
    if (this.failed) return;
    if (!this.kpiLoaded || !this.scorecardsLoaded || !this.fiscalYearsLoaded) return;
    if (this.fiscalYearIdResolved()) return;

    const fiscalYears = this.fiscalYears();
    const resolvedFy = this.requestedFiscalYearId || this.scorecard()?.fiscalYearId || fiscalYears[0]?.id || '';

    if (!resolvedFy) {
      this.loading.set(false);
      this.loadError.set('No fiscal year available for this scorecard.');
      return;
    }

    this.selectFiscalYear(resolvedFy, false);
  }

  /** Loads the targets of `fiscalYearId` and, when requested, keeps the URL in step. */
  private selectFiscalYear(fiscalYearId: string, updateUrl = true): void {
    this.fiscalYearIdResolved.set(fiscalYearId);
    this.fiscalYear.set(this.fiscalYears().find((f) => f.id === fiscalYearId) ?? null);
    this.saved.set(false);
    this.loading.set(true);
    this.loadError.set(null);
    this.resetTargetInputs();
    this.loadExistingTargets(this.kpiId, fiscalYearId);

    if (updateUrl) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { fiscalYearId },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  /** Switches the whole page to another fiscal year, so the month/quarter labels follow it. */
  onFiscalYearChange(value: string): void {
    if (value && value !== this.fiscalYearIdResolved()) {
      this.selectFiscalYear(value);
    }
  }

  private resetTargetInputs(): void {
    this.annualTarget.set(null);
    this.quarterly.set([0, 0, 0, 0]);
    this.monthly.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  }

  private loadExistingTargets(kpiId: string, fiscalYearId: string): void {
    this.kpiService.getTargets(kpiId, fiscalYearId).subscribe({
      next: (values) => {
        const annual = values.find((v) => v.granularity === 'Annual');
        const quarterly = this.quarterly().slice();
        const monthly = this.monthly().slice();
        for (const v of values) {
          if (v.granularity === 'Quarterly' && v.quarter >= 1 && v.quarter <= 4) {
            quarterly[v.quarter - 1] = v.targetValue;
          }
          if (v.granularity === 'Monthly' && v.fiscalMonth >= 1 && v.fiscalMonth <= 12) {
            monthly[v.fiscalMonth - 1] = v.targetValue;
          }
        }
        this.annualTarget.set(annual?.targetValue ?? null);
        this.quarterly.set(quarterly);
        this.monthly.set(monthly);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Failed to load existing targets.');
      },
    });
  }

  // ── Label helpers ────────────────────────────────────────────────────────

  monthLabel(mi: number): string {
    // The fiscal month is 1-based; the shared helper derives the Gregorian month name from the
    // fiscal-year start, so labels follow any start month instead of assuming July–June.
    return fiscalMonthLabel(this.fiscalYear()?.startDate ?? null, mi + 1);
  }

  quarterLabel(q: number): string {
    const fy = this.fiscalYear();
    if (!fy?.startDate) return `Q${q + 1}`;
    const startMonth = Number(fy.startDate.slice(5, 7)) - 1;
    if (Number.isNaN(startMonth) || startMonth < 0) return `Q${q + 1}`;
    const startYear = Number(fy.startDate.slice(0, 4));
    const from = fiscalMonthLabel(fy.startDate, q * 3 + 1);
    const to = fiscalMonthLabel(fy.startDate, q * 3 + 3);
    const toYear = startYear + Math.floor((startMonth + q * 3 + 2) / 12);
    return `Q${q + 1} · ${from}–${to} ${toYear}`;
  }

  // ── Month/quarter accessors ───────────────────────────────────────────────

  monthsOfQuarter(q: number): number[] {
    return [q * 3, q * 3 + 1, q * 3 + 2];
  }

  quarterDisplay(q: number): number {
    return this.quarterly()[q];
  }

  quarterSum(q: number): number {
    return this.monthsOfQuarter(q).reduce((s, mi) => s + this.monthly()[mi], 0);
  }

  monthsFilled(q: number): boolean {
    return this.monthsOfQuarter(q).every((mi) => this.monthly()[mi] !== 0);
  }

  private qSumOk(q: number): boolean {
    return Math.abs(this.quarterSum(q) - this.quarterDisplay(q)) < 0.005;
  }

  // ── Value setters ─────────────────────────────────────────────────────────

  setAnnual(event: Event): void {
    const input = (event.target as HTMLInputElement).value.trim();
    const n = input === '' ? null : Number(input);
    this.annualTarget.set(n !== null && Number.isNaN(n) ? null : n);
    this.saved.set(false);
  }

  setQuarterly(q: number, event: Event): void {
    if (this.autoCalc()) return;
    const v = this.parseValue((event.target as HTMLInputElement).value);
    const next = this.quarterly().slice();
    next[q] = v;
    this.quarterly.set(next);
    this.saved.set(false);
  }

  setMonthly(mi: number, event: Event): void {
    const v = this.parseValue((event.target as HTMLInputElement).value);
    const next = this.monthly().slice();
    next[mi] = v;
    this.monthly.set(next);
    if (this.autoCalc() && this.isCumulative()) this.recomputeQuarterly(next);
    this.saved.set(false);
  }

  setAutoCalc(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.autoCalc.set(on);
    if (on && this.isCumulative()) this.recomputeQuarterly(this.monthly());
    this.saved.set(false);
  }

  private parseValue(raw: string): number {
    const t = raw.trim();
    if (t === '') return 0;
    const n = Number(t);
    return Number.isNaN(n) ? 0 : n;
  }

  private recomputeQuarterly(months: number[]): void {
    const next = this.quarterly().slice();
    for (let q = 0; q < 4; q++) {
      next[q] = this.monthsOfQuarter(q).reduce((s, mi) => s + months[mi], 0);
    }
    this.quarterly.set(next);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  readonly annualValid = computed(() => {
    const a = this.annualTarget();
    return a !== null && !Number.isNaN(a);
  });

  /** Human readable error per quarter box, or null when that quarter is fine. */
  qError(q: number): string | null {
    if (!this.annualValid()) return null;
    if (this.isCumulative()) {
      if (!this.monthsFilled(q)) return 'Fill all 3 month targets.';
      if (!this.qSumOk(q)) {
        return `Month total (${round(this.quarterSum(q))}) must equal the quarter target (${round(this.quarterDisplay(q))}).`;
      }
      return null;
    }
    const annual = this.annualTarget()!;
    if (this.quarterDisplay(q) !== annual) {
      return `Quarter target must equal the annual target (${round(annual)}).`;
    }
    if (this.monthsOfQuarter(q).some((mi) => this.monthly()[mi] !== this.quarterDisplay(q))) {
      return `Each month target must equal the quarter target (${round(this.quarterDisplay(q))}).`;
    }
    return null;
  }

  qValid(q: number): boolean {
    return this.qError(q) === null;
  }

  /** Global error blocking the save, or null when everything is reconciled. */
  readonly summaryError = computed<string | null>(() => {
    if (!this.annualValid()) return 'Annual target is required.';
    if (this.autoCalc() && this.isCumulative()) {
      for (let q = 0; q < 4; q++) {
        if (!this.monthsFilled(q)) return `Q${q + 1} month targets are not all filled.`;
      }
      return null;
    }
    if (this.isCumulative()) {
      const quarters = this.quarterly();
      if (quarters.some((v) => v === 0)) return 'All four quarterly targets must be filled.';
      const sum = quarters.reduce((s, v) => s + v, 0);
      if (Math.abs(sum - this.annualTarget()!) >= 0.005) {
        return `Quarterly targets total ${round(sum)}, but the annual target is ${round(this.annualTarget()!)}. They must match exactly.`;
      }
      for (let q = 0; q < 4; q++) {
        const err = this.qError(q);
        if (err) return err;
      }
      return null;
    }
    const annual = this.annualTarget()!;
    for (let q = 0; q < 4; q++) {
      const err = this.qError(q);
      if (err) return err;
    }
    return null;
  });

  readonly canSave = computed(() => {
    return (
      this.kpi() !== null &&
      this.fiscalYearIdResolved() !== null &&
      !this.loading() &&
      !this.saving() &&
      !this.isReadOnly() &&
      this.summaryError() === null
    );
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  save(): void {
    const kpi = this.kpi();
    const fyId = this.fiscalYearIdResolved();
    if (!kpi || !fyId || this.saving()) return;
    if (this.isReadOnly()) return;

    this.saving.set(true);
    const req: SetKpiTargetsRequest = {
      kpiId: kpi.id,
      fiscalYearId: fyId,
      monthlyTargets: this.monthly().slice(),
      quarterlyTargets: this.quarterly().slice(),
      annualTarget: this.annualTarget(),
    };
    this.kpiService.setTargets(req).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.notifications.success('Targets saved.');
      },
      error: (e) => {
        this.saving.set(false);
        this.notifications.error(e?.message ?? 'Failed to save targets.');
      },
    });
  }

  goBack(): void {
    const scorecardId = this.scorecard()?.id;
    this.router.navigate(scorecardId ? ['/scorecards', scorecardId] : ['/scorecards']);
  }
}