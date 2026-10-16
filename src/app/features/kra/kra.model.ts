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
  createdDate?: string;
}

export interface CreateKraRequest {
  goalId: string;
  scorecardId: string;
  name: string;
  description?: string;
  weight: number;
}

export interface UpdateKraRequest {
  name?: string;
  description?: string;
  weight?: number;
  isActive?: boolean;
}
