import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';
import { KPIService } from '../../core/service/kpi.service';
import { PeriodLockStatusItem } from '../../core/model/goal.model';

@Component({
  selector: 'app-actuals-data',
  imports: [ReactiveFormsModule],
  templateUrl: './actuals-data.html',
  styleUrl: './actuals-data.scss',
})
export class ActualsDataPage {
  private readonly kpiService = inject(KPIService);
  private readonly notifications = inject(NotificationService);

  readonly form = new FormGroup({
    kpiId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    fiscalYearId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    actualValue: new FormControl(0, { nonNullable: true, validators: [Validators.required] }),
    periodLabel: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly submitting = signal(false);

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);

    const kpiId = this.form.controls.kpiId.value.trim();
    const fiscalYearId = this.form.controls.fiscalYearId.value.trim();
    const periodLabel = this.form.controls.periodLabel.value.trim();
    const value = this.form.controls.actualValue.value;

    this.kpiService.getById(kpiId).subscribe({
      next: (kpi) => this.submitWithScorecard(kpiId, fiscalYearId, kpi.scorecardId, periodLabel, value),
      error: (err) => {
        this.notifications.error(toApiError(err).message);
        this.submitting.set(false);
      },
    });
  }

  private submitWithScorecard(
    kpiId: string,
    fiscalYearId: string,
    scorecardId: string,
    periodLabel: string,
    value: number,
  ): void {
    this.kpiService.getLockStatus(scorecardId, fiscalYearId).subscribe({
      next: (lock) => {
        const period = this.resolvePeriod(lock.periods, periodLabel);
        if (!period) {
          this.notifications.error(
            `No fiscal period matches "${periodLabel}". Use e.g. M3, Q1, or a fiscal period ID.`,
          );
          this.submitting.set(false);
          return;
        }
        if (period.state !== 'open') {
          this.notifications.error(`Period "${periodLabel}" is ${period.state} and cannot accept actuals.`);
          this.submitting.set(false);
          return;
        }
        this.kpiService
          .enterActual({
            kpiId,
            fiscalPeriodId: period.fiscalPeriodId!,
            value,
            dataSource: 'Manual',
          })
          .subscribe({
            next: () => {
              this.notifications.success('Actual value recorded.');
              this.form.reset({ actualValue: 0 });
              this.submitting.set(false);
            },
            error: (err) => {
              this.notifications.error(toApiError(err).message);
              this.submitting.set(false);
            },
          });
      },
      error: (err) => {
        this.notifications.error(toApiError(err).message);
        this.submitting.set(false);
      },
    });
  }

  private resolvePeriod(periods: PeriodLockStatusItem[], label: string): PeriodLockStatusItem | null {
    if (label.length === 36 && label.includes('-')) {
      return periods.find((p) => p.fiscalPeriodId?.toLowerCase() === label.toLowerCase()) ?? null;
    }
    const month = /^M(\d{1,2})$/i.exec(label);
    if (month) {
      const n = Number(month[1]);
      return (
        periods.find((p) => p.fiscalMonth === n && !p.isQuarterEnd && !p.isYearEnd) ??
        periods.find((p) => p.fiscalMonth === n) ??
        null
      );
    }
    const quarter = /^Q([1-4])$/i.exec(label);
    if (quarter) {
      const q = Number(quarter[1]);
      return (
        periods.find((p) => p.quarter === q && p.isQuarterEnd) ??
        periods.find((p) => p.quarter === q) ??
        null
      );
    }
    return null;
  }
}