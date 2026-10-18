import { Component, inject, signal } from '@angular/core';
import { ColDef, CellValueChangedEvent, EditableCallbackParams } from 'ag-grid-community';
import { toApiError } from '../../core/model/api-error';
import { FiscalYear } from './fiscal-year.model';
import { FiscalYearService } from './fiscal-year.service';
import { NotificationService } from '../../core/service/notification.service';
import { fiscalYearHasEnded } from '../strategic-scorecard/workspace-state.service';
import { GridTable } from '../../shared/reusableComponent/grid-table/grid-table';
import { actionsColumn } from '../../shared/reusableComponent/grid-table/grid-table-actions';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import {
  FiscalYearFormComponent,
  FiscalYearFormGroup,
  buildCreateFiscalYearRequest,
  buildUpdateFiscalYearRequest,
  createFiscalYearForm,
  fiscalYearEndDateFor,
} from './fiscal-year-form';

@Component({
  selector: 'app-fiscal-year',
  imports: [GridTable, FiscalYearFormComponent],
  templateUrl: './fiscal-year.html',
  styleUrl: './fiscal-year.scss',
})
export class FiscalYearPage {
  private readonly fyService = inject(FiscalYearService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);

  readonly rows = signal<FiscalYear[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);

  /** Shared fiscal-year form: the same component, validation and rules as the Scorecards modal. */
  readonly fiscalYearForm: FiscalYearFormGroup = createFiscalYearForm();

  /** True while editing a year that already has scorecards: its dates become read-only. */
  readonly datesLocked = signal(false);

  readonly columnDefs: ColDef[] = [
    {
      field: 'label',
      headerName: 'Label',
      sortable: true,
      filter: true,
      flex: 1,
      editable: (params: EditableCallbackParams<FiscalYear>) => this.isEditable(params.data),
    },
    {
      field: 'startDate',
      headerName: 'Start Date',
      sortable: true,
      editable: (params: EditableCallbackParams<FiscalYear>) => this.canEditDates(params.data),
      cellEditor: 'agDateStringCellEditor',
      cellEditorPopup: true,
      valueFormatter: (params) => dayMonthYear(params.value),
    },
    {
      // Read-only: the end date is always the last day of the twelfth month after the start and
      // is derived by the server, so it is never edited here.
      field: 'endDate',
      headerName: 'End Date',
      sortable: true,
      valueFormatter: (params) => dayMonthYear(params.value),
    },
    { field: 'status', headerName: 'Status', sortable: true, filter: true },
    actionsColumn<FiscalYear>((key, row) => {
      if (key === 'edit') this.onEdit(row);
      if (key === 'delete') this.onDelete(row.id);
    }),
  ];

  constructor() {
    this.loadAll();
  }

  /**
   * FR-703: only an Open year whose end date has not yet passed in EAT can be edited,
   * deleted, or have its cells edited inline. Ended, closed and archived years are
   * read-only historical records. The backend enforces the same rule and remains
   * authoritative; this only drives the affordances and avoids a guaranteed 409.
   */
  isEditable(row: FiscalYear | null | undefined): boolean {
    if (!row) return false;
    if ((row.status ?? '').toLowerCase() !== 'open') return false;
    return !fiscalYearHasEnded(row.endDate);
  }

  /**
   * The start date can only be corrected while nothing is built on the year's calendar: once a
   * scorecard exists the year's dates are read-only (the label stays editable). The backend
   * enforces this too; here it only hides the affordance.
   */
  canEditDates(row: FiscalYear | null | undefined): boolean {
    return this.isEditable(row) && !row?.hasScorecards;
  }

  loadAll(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.fyService.getAll().subscribe({
      next: (data) => this.rows.set(data),
      error: (err) => { this.loadError.set(toApiError(err).message); this.loading.set(false); },
      complete: () => this.loading.set(false),
    });
  }

  /** End date derived from the current start month; shown read-only so it cannot drift. */
  fiscalYearEndDate(): string {
    return fiscalYearEndDateFor(this.fiscalYearForm);
  }

  openAddModal(): void {
    this.editingId.set(null);
    this.fiscalYearForm.reset({ label: '', startMonth: '' });
    this.fiscalYearForm.controls.startMonth.enable();
    this.datesLocked.set(false);
    this.showForm.set(true);
  }

  onEdit(item: FiscalYear): void {
    if (!this.isEditable(item)) {
      this.notifications.warning('Only an open fiscal year whose end date has not passed can be edited.');
      return;
    }
    this.editingId.set(item.id);
    const startMonth = item.startDate.split('T')[0].slice(0, 7);
    this.fiscalYearForm.setValue({ label: item.label, startMonth });
    // A year carrying scorecards can still be relabelled, but its dates must not move.
    const locked = !!item.hasScorecards;
    this.datesLocked.set(locked);
    if (locked) this.fiscalYearForm.controls.startMonth.disable();
    else this.fiscalYearForm.controls.startMonth.enable();
    this.showForm.set(true);
  }

  onCancelEdit(): void {
    this.editingId.set(null);
    this.fiscalYearForm.controls.startMonth.enable();
    this.datesLocked.set(false);
    this.fiscalYearForm.reset();
    this.showForm.set(false);
  }

  onSubmit(): void {
    if (this.submitting()) return;
    const request = buildCreateFiscalYearRequest(this.fiscalYearForm);
    if (!request) return;
    this.submitting.set(true);

    this.fyService.create(request).subscribe({
      next: () => { this.notifications.success('Fiscal year created.'); this.onCancelEdit(); this.loadAll(); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.submitting.set(false); },
      complete: () => this.submitting.set(false),
    });
  }

  onUpdate(): void {
    const id = this.editingId();
    if (!id || this.submitting()) return;
    // The end date is never sent — the server derives it. When the year already has scorecards
    // the start month is locked, so only the label is sent.
    const payload = buildUpdateFiscalYearRequest(this.fiscalYearForm, this.datesLocked());
    if (!payload) return;
    this.submitting.set(true);

    this.fyService.update(id, payload).subscribe({
      next: () => { this.notifications.success('Fiscal year updated.'); this.onCancelEdit(); this.loadAll(); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.submitting.set(false); },
      complete: () => this.submitting.set(false),
    });
  }

  async onDelete(id: string): Promise<void> {
    // Ended, closed and archived years are never deletable here. For an Open year the
    // client cannot know whether historical scorecards/targets/actuals exist, so the
    // attempt proceeds and the backend's 409 message is surfaced below.
    const row = this.rows().find((fy) => fy.id === id);
    if (!this.isEditable(row)) {
      this.notifications.warning('Only an open fiscal year whose end date has not passed can be deleted.');
      return;
    }

    const ok = await this.dialog.confirm('Delete Fiscal Year', 'Are you sure you want to delete this fiscal year? This cannot be undone.', { confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;

    this.fyService.delete(id).subscribe({
      next: () => { this.notifications.success('Fiscal year deleted.'); if (this.editingId() === id) this.onCancelEdit(); this.loadAll(); },
      error: (err) => this.notifications.error(toApiError(err).message),
    });
  }

  onCellValueChanged(event: CellValueChangedEvent<FiscalYear>): void {
    const row = event.data;
    const field = event.colDef.field;
    if (!row || !field) return;

    // Defensive: the editable callbacks already block locked rows, but never persist an
    // inline edit on a year that has ended or is closed/archived, nor move the dates of a
    // year that already has scorecards.
    if (!this.isEditable(row) || (field === 'startDate' && row.hasScorecards)) {
      row[field as keyof FiscalYear] = event.oldValue as never;
      event.api.refreshCells({ rowNodes: [event.node], columns: [field], force: true });
      this.notifications.warning('This fiscal year is read-only and cannot be edited.');
      return;
    }

    row[field as keyof FiscalYear] = dateOnly(event.newValue) as never;

    // The end date is never sent — the server derives it from the start.
    this.fyService.update(row.id, {
      label: row.label,
      startDate: dateOnly(row.startDate),
    }).subscribe({
      next: () => {
        // A start-date change shifts the server-derived end date, so refresh from the source.
        if (field === 'startDate') this.loadAll();
      },
      error: (err) => {
        row[field as keyof FiscalYear] = event.oldValue as never;
        event.api.refreshCells({ rowNodes: [event.node], columns: [field], force: true });
        this.notifications.error(toApiError(err).message);
        this.loadAll();
      },
    });
  }
}

/**
 * Last day of the twelfth consecutive month after a "YYYY-MM" fiscal-year start is derived by
 * the shared fiscal-year form logic ({@link endDateForMonth} in `fiscal-year-form.ts`);
 * only the grid display helpers remain here.
 */

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Grid display for a fiscal-year date: day number, month letters and year, e.g. "1 Jun 2026". */
function dayMonthYear(value: unknown): string {
  const iso = dateOnly(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  const name = MONTH_ABBR[Number(month) - 1];
  return name && year && day ? `${Number(day)} ${name} ${year}` : iso;
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (value === null || value === undefined) return '';
  return String(value).split('T')[0];
}
