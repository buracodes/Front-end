import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { KPIService } from '../../core/service/kpi.service';
import type { PeriodLockStatusItem, SetPeriodLockConfigRequest } from '../../core/model/goal.model';
import {
  ScorecardWorkspaceState,
  fiscalMonthLabel,
} from '../strategic-scorecard/workspace-state.service';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';

import { LucideDynamicIcon } from '@lucide/angular';

interface LockDraft {
  entryOpenDay: number;
  cutoffDay: number;
  reminderDaysBeforeCutoff: number;
}

@Component({
  selector: 'app-data-locking',
  imports: [DatePipe, LucideDynamicIcon],
  templateUrl: './data-locking.html',
  styleUrl: './data-locking.scss',
})
export class DataLockingPage implements OnInit {
  private readonly state = inject(ScorecardWorkspaceState);
  private readonly kpiService = inject(KPIService);
  private readonly notifications = inject(NotificationService);
  private readonly userStore = inject(UserStore);

  readonly fiscalYears = this.state.fiscalYears;
  readonly scorecards = this.state.scorecards.asReadonly();
  readonly fiscalYearId = this.state.fiscalYearId;
  readonly scorecardId = this.state.scorecardId;
  readonly loading = this.state.loading;

  readonly canManage = computed(() => this.userStore.hasPermission('admin:config.manage'));

  readonly periods = computed<PeriodLockStatusItem[]>(() =>
    (this.state.locks()?.periods ?? []).slice().sort((a, b) => a.fiscalMonth - b.fiscalMonth)
  );

  readonly draft = signal<Map<string, LockDraft>>(new Map());
  readonly saving = signal<string | null>(null);

  readonly counts = computed(() => {
    let open = 0;
    let pending = 0;
    let locked = 0;
    for (const p of this.periods()) {
      if (p.state === 'open') open++;
      else if (p.state === 'notYetOpen') pending++;
      else locked++;
    }
    return { open, pending, locked };
  });

  ngOnInit(): void {
    this.state.loadFiscalYearsAndScorecards();
  }

  onFiscalYearChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectFiscalYear(id);
  }

  onScorecardChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectScorecard(id);
  }

  monthLabel(period: PeriodLockStatusItem): string {
    return fiscalMonthLabel(this.state.selectedFiscalYear()?.startDate, period.fiscalMonth, true);
  }

  stateLabel(period: PeriodLockStatusItem): string {
    return period.state === 'open' ? 'Open' : period.state === 'notYetOpen' ? 'Not Yet Open' : 'Locked';
  }

  stateTone(period: PeriodLockStatusItem): string {
    return period.state === 'open' ? 'open' : period.state === 'notYetOpen' ? 'pending' : 'locked';
  }

  draftFor(period: PeriodLockStatusItem): LockDraft {
    return (
      this.draft().get(period.fiscalPeriodId) ?? {
        entryOpenDay: period.effectiveEntryOpenDay,
        cutoffDay: period.effectiveCutoffDay,
        reminderDaysBeforeCutoff: period.effectiveReminderDaysBeforeCutoff,
      }
    );
  }

  isDirty(period: PeriodLockStatusItem): boolean {
    return this.draft().has(period.fiscalPeriodId);
  }

  setField(period: PeriodLockStatusItem, field: keyof LockDraft, value: string): void {
    const map = this.draft();
    const draft: LockDraft = {
      ...this.draftFor(period),
      [field]: value === '' ? 0 : Number(value),
    };
    map.set(period.fiscalPeriodId, draft);
    this.draft.set(new Map(map));
  }

  clearDraft(period: PeriodLockStatusItem): void {
    const map = this.draft();
    map.delete(period.fiscalPeriodId);
    this.draft.set(new Map(map));
  }

  private submit(request: SetPeriodLockConfigRequest, period: PeriodLockStatusItem, message: string): void {
    if (!request.scorecardId || !request.fiscalPeriodId) return;
    this.saving.set(period.fiscalPeriodId);
    this.kpiService.setLockConfig(request).subscribe({
      next: (updated) => {
        this.saving.set(null);
        this.state.updateLockStatus(updated);
        this.clearDraft(period);
        this.notifications.success(message);
      },
      error: (err) => {
        this.saving.set(null);
        this.notifications.error(toApiError(err).message);
      },
    });
  }

  saveConfig(period: PeriodLockStatusItem): void {
    const scorecardId = this.scorecardId();
    if (!scorecardId) return;
    const draft = this.draftFor(period);
    this.submit(
      {
        scorecardId,
        fiscalPeriodId: period.fiscalPeriodId,
        entryOpenDay: draft.entryOpenDay,
        cutoffDay: draft.cutoffDay,
        reminderDaysBeforeCutoff: draft.reminderDaysBeforeCutoff,
        lock: false,
        unlock: false,
        forceOpen: false,
      },
      period,
      `Lock window saved for ${this.monthLabel(period)}.`,
    );
  }

  lock(period: PeriodLockStatusItem): void {
    const scorecardId = this.scorecardId();
    if (!scorecardId) return;
    const draft = this.draftFor(period);
    this.submit(
      {
        scorecardId,
        fiscalPeriodId: period.fiscalPeriodId,
        entryOpenDay: draft.entryOpenDay,
        cutoffDay: draft.cutoffDay,
        reminderDaysBeforeCutoff: draft.reminderDaysBeforeCutoff,
        lock: true,
        unlock: false,
        forceOpen: false,
      },
      period,
      `${this.monthLabel(period)} locked. Overrides affect all users; entries are prevented.`,
    );
  }

  unlock(period: PeriodLockStatusItem): void {
    const scorecardId = this.scorecardId();
    if (!scorecardId) return;
    const draft = this.draftFor(period);
    this.submit(
      {
        scorecardId,
        fiscalPeriodId: period.fiscalPeriodId,
        entryOpenDay: draft.entryOpenDay,
        cutoffDay: draft.cutoffDay,
        reminderDaysBeforeCutoff: draft.reminderDaysBeforeCutoff,
        lock: false,
        unlock: true,
        forceOpen: false,
      },
      period,
      `${this.monthLabel(period)} unlocked. Entries are permitted again.`,
    );
  }

  forceOpen(period: PeriodLockStatusItem): void {
    const scorecardId = this.scorecardId();
    if (!scorecardId) return;
    const draft = this.draftFor(period);
    this.submit(
      {
        scorecardId,
        fiscalPeriodId: period.fiscalPeriodId,
        entryOpenDay: draft.entryOpenDay,
        cutoffDay: draft.cutoffDay,
        reminderDaysBeforeCutoff: draft.reminderDaysBeforeCutoff,
        lock: false,
        unlock: false,
        forceOpen: true,
      },
      period,
      `${this.monthLabel(period)} forced open. Entries are permitted regardless of date window.`,
    );
  }

  refresh(): void {
    this.state.reloadLocks();
    this.notifications.info('Lock status refreshed.');
  }
}