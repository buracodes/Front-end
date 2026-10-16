export interface Kpi {
  id: string;
  scorecardId: string;
  scorecardName?: string;
  kraId?: string;
  kraName?: string;
  goalId?: string;
  goalName?: string;
  name: string;
  description?: string;
  unit?: string;
  weight: number;
  optimizationType: 'Maximize' | 'Minimize' | 'ExactHit' | 'Binary';
  dataSource: 'Manual' | 'Automated' | 'Calculated';
  kpiType: 'Leading' | 'Lagging';
  isCumulative: boolean;
  baseline?: number;
  minValue?: number;
  maxValue?: number;
  isActive: boolean;
  childKpiCount: number;
  ownerId?: string;
  ownerName?: string;
  divisionOwnerId?: string;
  divisionOwnerName?: string;
  createdDate?: string;
}

export interface CreateKpiRequest {
  scorecardId: string;
  kraId?: string;
  name: string;
  description?: string;
  unit?: string;
  weight: number;
  optimizationType?: 'Maximize' | 'Minimize' | 'ExactHit' | 'Binary';
  dataSource?: 'Manual' | 'Automated' | 'Calculated';
  kpiType?: 'Leading' | 'Lagging';
  isCumulative?: boolean;
  baseline?: number;
  minValue?: number;
  maxValue?: number;
  divisionOwnerId?: string;
}

export interface UpdateKpiRequest {
  name?: string;
  description?: string;
  unit?: string;
  weight?: number;
  optimizationType?: 'Maximize' | 'Minimize' | 'ExactHit' | 'Binary';
  kpiType?: 'Leading' | 'Lagging';
  isActive?: boolean;
  divisionOwnerId?: string;
}
