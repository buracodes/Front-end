export interface FiscalYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  /** True when at least one scorecard was built on this year; its dates are then read-only. */
  hasScorecards?: boolean;
}

export interface CreateFiscalYearRequest {
  label: string;
  startDate: string;
  endDate: string;
}

export interface UpdateFiscalYearRequest {
  label?: string;
  /**
   * New start date (first day of a month). The end date is never sent: the server always
   * derives it as the last day of the twelfth month.
   */
  startDate?: string;
}
