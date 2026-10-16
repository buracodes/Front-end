import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ColDef, CellValueChangedEvent, EditableCallbackParams } from 'ag-grid-community';
import { toApiError } from '../../core/model/api-error';
import { FiscalYear } from './fiscal-year.model';
import { FiscalYearService } from './fiscal-year.service';
import { NotificationService } from '../../core/service/notification.service';
import { fiscalYearHasEnded } from '../strategic-scorecard/workspace-state.service';
import { GridTable } from '../../shared/reusableComponent/grid-table/grid-table';
import { actionsColumn } from '../../shared/reusableComponent/grid-table/grid-table-actions';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-fiscal-year',
  imports: [GridTable, ReactiveFormsModule, LucideDynamicIcon],
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

  readonly form = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    // A "YYYY-MM" month picker. The backend requires the first day of a month, so the UI can
    // only ever produce a valid start and no free-text date can slip through.
    startMonth: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  /** End date derived from the chosen start month; shown read-only so it cannot drift. */
  readonly computedEndDate = signal('');

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
      editable: (params: EditableCallbackParams<FiscalYear>) => this.isEditable(params.data),
      cellEditor: 'agDateStringCellEditor',
      cellEditorPopup: true,
      valueFormatter: (params) => dayMonthYear(params.value),
    },
    {
      field: 'endDate',
      headerName: 'End Date',
      sortable: true,
      editable: (params: EditableCallbackParams<FiscalYear>) => this.isEditable(params.data),
      cellEditor: 'agDateStringCellEditor',
      cellEditorPopup: true,
      valueFormatter: (params) => dayMonthYear(params.value),
    },
    { field: 'status', headerName: 'Status', sortable: true, filter: true },
    actionsColumn<FiscalYear>((key, row) => {
      if (key === 'edit') this.onEdit(row);
      if (key === 'delete') this.onDelete(row.id);
    }),
  ];

  constructor() {
    this.form.controls.startMonth.valueChanges.subscribe((value) => {
      this.computedEndDate.set(endDateForMonth(value));
    });
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

  loadAll(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.fyService.getAll().subscribe({
      next: (data) => this.rows.set(data),
      error: (err) => { this.loadError.set(toApiError(err).message); this.loading.set(false); },
      complete: () => this.loading.set(false),
    });
  }

  openAddModal(): void {
    this.editingId.set(null);
    this.form.reset({ label: '', startMonth: '' });
    this.computedEndDate.set('');
    this.showForm.set(true);
  }

  onEdit(item: FiscalYear): void {
    if (!this.isEditable(item)) {
      this.notifications.warning('Only an open fiscal year whose end date has not passed can be edited.');
      return;
    }
    this.editingId.set(item.id);
    const startMonth = item.startDate.split('T')[0].slice(0, 7);
    this.form.setValue({ label: item.label, startMonth });
    this.computedEndDate.set(endDateForMonth(startMonth));
    this.showForm.set(true);
  }

  onCancelEdit(): void {
    this.editingId.set(null);
    this.form.reset();
    this.showForm.set(false);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);

    const value = this.form.getRawValue();
    this.fyService.create({
      label: value.label,
      startDate: `${value.startMonth}-01`,
      endDate: this.computedEndDate(),
    }).subscribe({
      next: () => { this.notifications.success('Fiscal year created.'); this.onCancelEdit(); this.loadAll(); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.submitting.set(false); },
      complete: () => this.submitting.set(false),
    });
  }

  onUpdate(): void {
    const id = this.editingId();
    if (!id || this.form.invalid || this.submitting()) return;
    this.submitting.set(true);

    const value = this.form.getRawValue();
    this.fyService.update(id, {
      label: value.label,
      startDate: `${value.startMonth}-01`,
      endDate: this.computedEndDate(),
    }).subscribe({
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

    // Defensive: the editable callback already blocks locked rows, but never persist an
    // inline edit on a year that has ended or is closed/archived.
    if (!this.isEditable(row)) {
      row[field as keyof FiscalYear] = event.oldValue as never;
      event.api.refreshCells({ rowNodes: [event.node], columns: [field], force: true });
      this.notifications.warning('This fiscal year is read-only and cannot be edited.');
      return;
    }

    row[field as keyof FiscalYear] = dateOnly(event.newValue) as never;

    this.fyService.update(row.id, {
      label: row.label,
      startDate: dateOnly(row.startDate),
      endDate: dateOnly(row.endDate),
    }).subscribe({
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
 * Last day of the twelfth consecutive month after a "YYYY-MM" fiscal-year start, as
 * "YYYY-MM-DD". Mirrors the backend's authoritative end-date rule (start + 12 months - 1 day)
 * so the form can show the value the server will persist.
 */
function endDateForMonth(monthValue: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return '';
  const end = new Date(Date.UTC(year, month - 1 + 12, 0));
  const m = String(end.getUTCMonth() + 1).padStart(2, '0');
  const d = String(end.getUTCDate()).padStart(2, '0');
  return `${end.getUTCFullYear()}-${m}-${d}`;
}

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
