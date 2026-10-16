import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';
import { ScorecardService } from './scorecard.service';
import { ScorecardService as CoreScorecardService } from '../../core/service/scorecard.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { Scorecard, CreateScorecardRequest, UpdateScorecardRequest } from './scorecard.model';
import { FiscalYear, CreateFiscalYearRequest } from '../../core/model/scorecard.model';

import { LucideDynamicIcon } from '@lucide/angular';
interface FiscalYearGroup {
  fiscalYearId: string;
  fiscalYearLabel: string;
  scorecards: Scorecard[];
}

@Component({
  selector: 'app-scorecard',
  imports: [ReactiveFormsModule, DatePipe, LucideDynamicIcon],
  templateUrl: './scorecard.html',
  styleUrl: './scorecard.scss',
})
export class ScorecardPage implements OnInit {
  private readonly scorecardService = inject(ScorecardService);
  private readonly coreScorecardService = inject(CoreScorecardService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly router = inject(Router);

  readonly rows = signal<Scorecard[]>([]);
  readonly fiscalYears = signal<FiscalYear[]>([]);
  readonly fiscalYearsLoading = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly showFiscalYearModal = signal(false);
  readonly fiscalYearSubmitting = signal(false);

  readonly searchText = signal('');
  readonly fiscalYearFilter = signal('');
  readonly scopeFilter = signal('');
  readonly statusFilter = signal('');

  readonly openMenuId = signal<string | null>(null);

  readonly scopes: Scorecard['scope'][] = ['Corporate', 'Division', 'Department'];
  readonly statuses: Scorecard['scorecardStatus'][] = ['Active', 'Closed'];

  readonly filteredScorecards = computed(() => {
    let list = this.rows();
    const q = this.searchText().trim().toLowerCase();
    const fyId = this.fiscalYearFilter();
    const scope = this.scopeFilter();
    const status = this.statusFilter();

    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.fiscalYearName ?? '').toLowerCase().includes(q) ||
          (s.description ?? '').toLowerCase().includes(q)
      );
    }
    if (fyId) {
      list = list.filter((s) => s.fiscalYearId === fyId);
    }
    if (scope) {
      const scopeLower = scope.toLowerCase();
      list = list.filter((s) => s.scope.toLowerCase() === scopeLower);
    }
    if (status) {
      const statusLower = status.toLowerCase();
      list = list.filter((s) => s.scorecardStatus.toLowerCase() === statusLower);
    }
    return list;
  });

  /** Filtered scorecards grouped under their fiscal year, most recent fiscal year first. */
  readonly scorecardsByFiscalYear = computed<FiscalYearGroup[]>(() => {
    const list = this.filteredScorecards();
    const fyOrder = this.fiscalYears();
    const groups = new Map<string, FiscalYearGroup>();

    for (const sc of list) {
      const existing = groups.get(sc.fiscalYearId);
      if (existing) {
        existing.scorecards.push(sc);
      } else {
        groups.set(sc.fiscalYearId, {
          fiscalYearId: sc.fiscalYearId,
          fiscalYearLabel: sc.fiscalYearName ?? fyOrder.find((fy) => fy.id === sc.fiscalYearId)?.label ?? 'Unknown fiscal year',
          scorecards: [sc],
        });
      }
    }

    const orderIndex = new Map(fyOrder.map((fy, i) => [fy.id, i]));
    return Array.from(groups.values()).sort(
      (a, b) => (orderIndex.get(a.fiscalYearId) ?? 999) - (orderIndex.get(b.fiscalYearId) ?? 999)
    );
  });

  readonly form = new FormGroup({
    fiscalYearId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    scope: new FormControl<Scorecard['scope']>('Corporate', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly fiscalYearForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    this.loadFiscalYears();
    this.loadScorecards();
  }

  private loadFiscalYears(onLoaded?: (fiscalYears: FiscalYear[]) => void): void {
    this.fiscalYearsLoading.set(true);
    this.coreScorecardService.getFiscalYears().subscribe({
      next: (fiscalYears) => {
        this.fiscalYears.set(fiscalYears);
        onLoaded?.(fiscalYears);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.fiscalYearsLoading.set(false),
    });
  }

  loadScorecards(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.scorecardService.getAll().subscribe({
      next: (scorecards) => this.rows.set(scorecards),
      error: (error) => {
        this.loadError.set(toApiError(error).message);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  onSearchInput(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  onScopeFilterChange(event: Event): void {
    this.scopeFilter.set((event.target as HTMLSelectElement).value);
  }

  onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
  }

  onFiscalYearFilterChange(event: Event): void {
    this.fiscalYearFilter.set((event.target as HTMLSelectElement).value);
  }

  clearFilters(): void {
    this.searchText.set('');
    this.fiscalYearFilter.set('');
    this.scopeFilter.set('');
    this.statusFilter.set('');
  }

  // ── Scorecard CRUD ──────────────────────────────────────────────────────

  openAddModal(): void {
    this.editingId.set(null);
    this.form.reset({ fiscalYearId: '', name: '', description: '', scope: 'Corporate' });
    this.showForm.set(true);
  }

  onEdit(scorecard: Scorecard, event: MouseEvent): void {
    event.stopPropagation();
    if (scorecard.scorecardStatus === 'Closed') {
      this.notifications.error('This scorecard is closed and read-only.');
      return;
    }
    this.editingId.set(scorecard.id);
    this.form.setValue({
      fiscalYearId: scorecard.fiscalYearId,
      name: scorecard.name,
      description: scorecard.description ?? '',
      scope: scorecard.scope,
    });
    this.showForm.set(true);
  }

  onCancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ scope: 'Department' });
    this.showForm.set(false);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    const request: CreateScorecardRequest = {
      fiscalYearId: this.form.controls.fiscalYearId.value,
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      scope: this.form.controls.scope.value,
    };

    this.scorecardService.create(request).subscribe({
      next: () => {
        this.notifications.success('Scorecard created successfully.');
        this.onCancelEdit();
        this.loadScorecards();
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false),
    });
  }

  onUpdate(): void {
    const id = this.editingId();
    if (!id || this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    const request: UpdateScorecardRequest = {
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      scope: this.form.controls.scope.value,
    };

    this.scorecardService.update(id, request).subscribe({
      next: () => {
        this.notifications.success('Scorecard updated successfully.');
        this.onCancelEdit();
        this.loadScorecards();
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false),
    });
  }

  async onDelete(scorecard: Scorecard, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (scorecard.scorecardStatus === 'Closed') {
      this.notifications.error('This scorecard is closed and cannot be deleted.');
      return;
    }
    const ok = await this.dialog.confirm(
      'Delete Scorecard',
      `Are you sure you want to delete "${scorecard.name}"? This cannot be undone.`,
      { confirmText: 'Delete', variant: 'danger' }
    );
    if (!ok) return;

    this.scorecardService.delete(scorecard.id).subscribe({
      next: () => {
        this.notifications.success('Scorecard deleted successfully.');
        if (this.editingId() === scorecard.id) {
          this.onCancelEdit();
        }
        this.loadScorecards();
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }

  async onClose(scorecard: Scorecard, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const ok = await this.dialog.confirm(
      'Close Scorecard',
      `Are you sure you want to close "${scorecard.name}"? It will become read-only.`,
      { confirmText: 'Close', variant: 'warning' }
    );
    if (!ok) return;

    this.scorecardService.close(scorecard.id).subscribe({
      next: () => {
        this.notifications.success('Scorecard closed successfully.');
        this.loadScorecards();
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }

  openScorecard(scorecard: Scorecard): void {
    this.openMenuId.set(null);
    if (scorecard.scope.toLowerCase() === 'division') {
      this.router.navigate(['/division-planning', scorecard.id]);
    } else {
      this.router.navigate(['/scorecards', scorecard.id]);
    }
  }

  toggleCardMenu(scorecardId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuId.update((current) => (current === scorecardId ? null : scorecardId));
  }

  isCardMenuOpen(scorecardId: string): boolean {
    return this.openMenuId() === scorecardId;
  }

  closeCardMenu(): void {
    this.openMenuId.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest('.actions-dropdown')) {
      this.closeCardMenu();
    }
  }

  statusBadgeClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'active':
        return 'badge-active';
      case 'closed':
        return 'badge-closed';
      default:
        return 'badge-draft';
    }
  }

  scopeBadgeClass(scope: string): string {
    switch (scope.toLowerCase()) {
      case 'corporate':
        return 'badge-corporate';
      case 'division':
        return 'badge-division';
      default:
        return 'badge-department';
    }
  }

  displayStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }

  // ── Fiscal Year creation ─────────────────────────────────────────────────

  openAddFiscalYearModal(): void {
    this.fiscalYearForm.reset({ label: '', startDate: '', endDate: '' });
    this.showFiscalYearModal.set(true);
  }

  closeFiscalYearModal(): void {
    this.showFiscalYearModal.set(false);
  }

  onSubmitFiscalYear(): void {
    if (this.fiscalYearForm.invalid || this.fiscalYearSubmitting()) return;

    this.fiscalYearSubmitting.set(true);
    const request: CreateFiscalYearRequest = this.fiscalYearForm.getRawValue();

    this.coreScorecardService.createFiscalYear(request).subscribe({
      next: (created) => {
        this.notifications.success('Fiscal year created.');
        this.showFiscalYearModal.set(false);
        this.fiscalYearSubmitting.set(false);
        // Reload fiscal years, then immediately open "Add Scorecard" pre-selected
        // to the one just created, matching the intended add-FY → add-scorecard flow.
        this.loadFiscalYears(() => {
          this.editingId.set(null);
          this.form.reset({ fiscalYearId: created.id, name: '', description: '', scope: 'Department' });
          this.showForm.set(true);
        });
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.fiscalYearSubmitting.set(false);
      },
    });
  }
}