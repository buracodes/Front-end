import { TestBed } from '@angular/core/testing';
import { FiscalYearFormComponent, buildCreateFiscalYearRequest, buildUpdateFiscalYearRequest, createFiscalYearForm, endDateForMonth, fiscalYearEndDateFor } from './fiscal-year-form';
import { CreateFiscalYearRequest } from './fiscal-year.model';

describe('fiscal-year-form shared logic', () => {
  describe('endDateForMonth (twelve-consecutive-month rule)', () => {
    it('computes the last day of the twelfth month after the start month', () => {
      expect(endDateForMonth('2026-09')).toBe('2027-08-31');
      expect(endDateForMonth('2026-01')).toBe('2026-12-31');
    });

    it('crosses a leap February', () => {
      expect(endDateForMonth('2023-03')).toBe('2024-02-29');
      expect(endDateForMonth('2027-03')).toBe('2028-02-29');
    });

    it('returns empty for anything that is not a full YYYY-MM', () => {
      expect(endDateForMonth('')).toBe('');
      expect(endDateForMonth('2026')).toBe('');
      expect(endDateForMonth('2026-13')).toBe('');
    });
  });

  describe('createFiscalYearForm (shared validation)', () => {
    it('requires a label of at most 50 characters and a start month', () => {
      const form = createFiscalYearForm();
      expect(form.valid).toBe(false);

      form.setValue({ label: '', startMonth: '2026-09' });
      expect(form.controls.label.hasError('required')).toBe(true);

      form.setValue({ label: 'x'.repeat(51), startMonth: '2026-09' });
      expect(form.controls.label.hasError('maxlength')).toBe(true);

      form.setValue({ label: 'FY 2027', startMonth: '' });
      expect(form.controls.startMonth.hasError('required')).toBe(true);

      form.setValue({ label: 'FY 2027', startMonth: '2026-09' });
      expect(form.valid).toBe(true);
    });

    it('derives an empty end date until a start month is picked', () => {
      const form = createFiscalYearForm();
      expect(fiscalYearEndDateFor(form)).toBe('');

      form.controls.startMonth.setValue('2026-07');
      expect(fiscalYearEndDateFor(form)).toBe('2027-06-30');
    });
  });

  describe('buildCreateFiscalYearRequest', () => {
    it('builds the first day of the chosen month and the derived end date', () => {
      const form = createFiscalYearForm();
      form.setValue({ label: 'FY 2027', startMonth: '2026-09' });

      expect(buildCreateFiscalYearRequest(form)).toEqual({
        label: 'FY 2027',
        startDate: '2026-09-01',
        endDate: '2027-08-31',
      });
    });

    it('trims the label and rejects invalid forms', () => {
      const form = createFiscalYearForm();
      expect(buildCreateFiscalYearRequest(form)).toBeNull();

      form.setValue({ label: '', startMonth: '2026-09' });
      expect(buildCreateFiscalYearRequest(form)).toBeNull();

      form.setValue({ label: '  FY 2027  ', startMonth: '2026-09' });
      const request = buildCreateFiscalYearRequest(form);
      expect(request?.label).toBe('FY 2027');
    });
  });

  describe('buildUpdateFiscalYearRequest', () => {
    it('sends the label and start date when the dates are editable', () => {
      const form = createFiscalYearForm();
      form.setValue({ label: 'FY 2027', startMonth: '2026-09' });

      expect(buildUpdateFiscalYearRequest(form, false)).toEqual({
        label: 'FY 2027',
        startDate: '2026-09-01',
      });
    });

    it('sends only the label when the year carries scorecards', () => {
      const form = createFiscalYearForm();
      form.setValue({ label: 'Renamed', startMonth: '2026-09' });

      expect(buildUpdateFiscalYearRequest(form, true)).toEqual({ label: 'Renamed' });
    });

    it('returns null when the payload would be incomplete', () => {
      const form = createFiscalYearForm();
      expect(buildUpdateFiscalYearRequest(form, false)).toBeNull();

      form.setValue({ label: 'FY', startMonth: '' });
      expect(buildUpdateFiscalYearRequest(form, false)).toBeNull();
    });
  });
});

describe('fiscal-year-form component', () => {
  it('emits the shared contract and disables the submit button while submitting', () => {
    
    const fixture = TestBed.createComponent(FiscalYearFormComponent);
    const form = createFiscalYearForm();
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('mode', 'create');
    fixture.componentRef.setInput('endDate', '2027-08-31');
    fixture.detectChanges();

    let submitted = 0;
    let cancelled = 0;
    fixture.componentInstance.submitted.subscribe(() => submitted++);
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);

    // Submit while the form is invalid: nothing is emitted and the button is disabled.
    form.setValue({ label: '', startMonth: '2026-09' });
    fixture.detectChanges();
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    // A valid form enables the button.
    form.setValue({ label: 'FY 2027', startMonth: '2026-09' });
    fixture.detectChanges();
    expect(submitButton.disabled).toBe(false);

    (submitButton as HTMLButtonElement).click();
    expect(submitted).toBe(1);
    expect(cancelled).toBe(0);

    // Submitting state disables the button.
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    expect(submitButton.disabled).toBe(true);
  });

  it('emits cancelled from the close and cancel actions', () => {
    
    const fixture = TestBed.createComponent(FiscalYearFormComponent);
    const form = createFiscalYearForm();
    form.setValue({ label: 'FY 2027', startMonth: '2026-09' });
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();

    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);

    fixture.nativeElement.querySelector('.close-btn').click();
    expect(cancelled).toBe(1);

    fixture.detectChanges();
    const cancel = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Cancel'));
    cancel?.click();
    expect(cancelled).toBe(2);
  });
});

/** Type-level smoke check: the create payload matches the shared fiscal-year model DTO. */
const _payload: CreateFiscalYearRequest | null = buildCreateFiscalYearRequest(createFiscalYearForm());
void _payload;
