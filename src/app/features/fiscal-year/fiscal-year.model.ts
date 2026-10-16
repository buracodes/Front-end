export interface FiscalYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface CreateFiscalYearRequest {
  label: string;
  startDate: string;
  endDate: string;
}

export interface UpdateFiscalYearRequest {
  label?: string;
  startDate?: string;
  endDate?: string;
}
