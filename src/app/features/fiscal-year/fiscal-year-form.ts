import { Component, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { CreateFiscalYearRequest, UpdateFiscalYearRequest } from './fiscal-year.model';

/**
 * Single source of truth for the fiscal-year form shared by the Fiscal Year page and the
 * Scorecards "Add Fiscal Year" modal:
 * - the reactive form shape and validation rules (label required + max length 50, start
 *   month required);
 * - the twelve-consecutive-month end-date derivation (mirroring the backend rule);
 * - the create/update payload builders (the end date is only ever derived; the backend
 *   computes the authoritative value and rejects a mismatch).
 */
export interface FiscalYearFormControls {
  label: FormControl<string>;
  startMonth: FormControl<string>;
}

export type FiscalYearFormGroup = FormGroup<FiscalYearFormControls>;

export function createFiscalYearForm(): FiscalYearFormGroup {
  return new FormGroup({
    // A "YYYY-MM" month picker. The backend requires the first day of a month, so the UI
    // can only ever produce a valid start and no free-text date can slip through.
    label: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    startMonth: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
}

/**
 * Last day of the twelfth consecutive month after a "YYYY-MM" fiscal-year start, as
 * "YYYY-MM-DD". Mirrors the backend's authoritative end-date rule (start + 12 months - 1 day)
 * so the form can show the value the server will persist.
 */
export function endDateForMonth(monthValue: string): string {
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

/** End date derived from the current start month; empty until a full "YYYY-MM" is set. */
export function fiscalYearEndDateFor(form: FiscalYearFormGroup): string {
  return endDateForMonth(form.controls.startMonth.value);
}

/** Build the create request; null while the form is invalid. */
export function buildCreateFiscalYearRequest(form: FiscalYearFormGroup): CreateFiscalYearRequest | null {
  if (form.invalid) return null;
  const startMonth = form.controls.startMonth.value;
  if (startMonth.length < 7) return null;
  return {
    label: form.controls.label.value.trim(),
    startDate: `${startMonth}-01`,
    endDate: endDateForMonth(startMonth),
  };
}

/**
 * Build the update request; null while the form is invalid. When the year carries scorecards
 * the dates are frozen and only the label is sent.
 */
export function buildUpdateFiscalYearRequest(
  form: FiscalYearFormGroup,
  datesLocked: boolean
): UpdateFiscalYearRequest | null {
  const label = form.controls.label.value.trim();
  if (form.controls.label.invalid) return null;
  if (datesLocked) return { label };
  const startMonth = form.controls.startMonth.value;
  if (form.controls.startMonth.invalid || startMonth.length < 7) return null;
  return { label, startDate: `${startMonth}-01` };
}

/**
 * The reusable fiscal-year modal form. Both the Fiscal Year page (create and edit) and the
 * Scorecards page (create) render this component; the owning page supplies the shared form
 * built by {@link createFiscalYearForm} and performs the API call itself, so validation,
 * date derivation and field behaviour are never duplicated.
 */
@Component({
  selector: 'app-fiscal-year-form',
  imports: [ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './fiscal-year-form.html',
})
export class FiscalYearFormComponent {
  /** The shared reactive form from {@link createFiscalYearForm}. */
  readonly form = input.required<FiscalYearFormGroup>();
  /** 'create' (page/modal) or 'edit' (Fiscal Year page inline edit). */
  readonly mode = input<'create' | 'edit'>('create');
  /** Edit mode: dates frozen because the year already has scorecards; label stays editable. */
  readonly locked = input(false);
  /** While the owner is POSTing/PUTting, the submit button is disabled and shows "Saving…". */
  readonly submitting = input(false);
  /** The derived end date for display, from {@link fiscalYearEndDateFor}. */
  readonly endDate = input('');

  readonly submitted = output<void>();
  readonly cancelled = output<void>();
}
