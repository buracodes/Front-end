export interface Kra {
  id: string;
  goalId: string;
  goalName?: string;
  scorecardId: string;
  scorecardName?: string;
  name: string;
  description?: string;
  weight: number;
  isActive: boolean;
  kpiCount: number;
  icon?: string;
  strategicThemeId?: string;
  unitMeasure?: string;
  createdDate?: string;
}

export interface CreateKraRequest {
  goalId: string;
  scorecardId: string;
  name: string;
  description?: string;
  weight: number;
  icon?: string;
  strategicThemeId?: string;
  unitMeasure?: string;
}

export interface UpdateKraRequest {
  name?: string;
  description?: string;
  weight?: number;
  isActive?: boolean;
  icon?: string;
  strategicThemeId?: string;
  unitMeasure?: string;
}
