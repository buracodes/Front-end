/**
 * FRD initiative lifecycle. There is no separate "Planned" or "Archived" state: an initiative that
 * has not started yet is NotStarted, and one nobody is working on is OnHold or Cancelled.
 */
export type InitiativeStatus =
  | 'NotStarted'
  | 'InProgress'
  | 'Completed'
  | 'OnHold'
  | 'Cancelled';

export type InitiativePriority = 'Low' | 'Medium' | 'High' | 'Critical';

/** FRD milestone delivery state. Completion drives it, so there is no On Hold. */
export type MilestoneStatus = 'NotStarted' | 'InProgress' | 'Completed';

/**
 * FRD progress band. The backend owns the thresholds (Green >= 95%, Amber 70-94.9%,
 * Red < 70%) and reports "NoData" when the initiative has no milestones to weigh.
 */
export type InitiativeRagLabel = 'Green' | 'Amber' | 'Red' | 'NoData';

/** "Amber" is the FRD's yellow band; the design tokens are named --color-rag-yellow. */
export function ragSlug(rag: InitiativeRagLabel): string {
  return rag === 'NoData' ? 'gray' : rag.toLowerCase();
}

export function ragLabel(rag: InitiativeRagLabel): string {
  switch (rag) {
    case 'Green':
      return 'On track';
    case 'Amber':
      return 'At risk';
    case 'Red':
      return 'Off track';
    default:
      return 'No data';
  }
}

export interface InitiativeBudget {
  isBudgetTracked: boolean;
  plannedBudget: number;
  actualExpenditure: number;
  budgetVariance: number | null;
  budgetUtilizationPercent: number | null;
  isOverBudget: boolean;
}


export interface InitiativeListItem {
  id: string;
  name: string;
  description?: string;
  priority: InitiativePriority;
  status: InitiativeStatus;
  budget: number;
  actualExpenditure: number;
  ownerId?: string;
  ownerName?: string;
  goalId?: string;
  kraId?: string;
  kpiId?: string;
  startDate?: string;
  endDate?: string;
  createdDate: string;
  isClosed: boolean;
  milestoneCount: number;
  progressPercentage: number;
  progressRagStatus: InitiativeRagLabel;
  totalMilestoneWeight: number;
  milestoneWeightsAreValid: boolean;
  budgetPosition: InitiativeBudget;
  isOverdue: boolean;
}

export interface PagedInitiatives {
  items: InitiativeListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  completionPercentage: number;
  dueDate: string;
  weight: number;
  status: MilestoneStatus;
  comments?: string;
  contributionPercentage: number;
  updatedDate?: string;
}

export interface InitiativeHistoryEntry {
  id: string;
  changeType: string;
  details?: string;
  initiativeId: string;
  milestoneId?: string;
  milestoneName?: string;
  previousValue?: string;
  newValue?: string;
  recordedByUserId?: string;
  recordedAtUtc: string;
}

export interface InitiativeDependency {
  initiativeId: string;
  dependsOnInitiativeId: string;
  dependsOnInitiativeName?: string;
}

export interface Initiative {
  id: string;
  name: string;
  description?: string;
  goalId?: string;
  goalName?: string;
  kraId?: string;
  kraName?: string;
  kpiId?: string;
  kpiName?: string;
  ownerId: string;
  ownerName?: string;
  priority: InitiativePriority;
  status: InitiativeStatus;
  startDate?: string;
  endDate?: string;
  budget: number;
  actualExpenditure: number;
  resources?: string;
  isClosed: boolean;
  closedAtUtc?: string;
  closedByUserId?: string;
  actualEndDate?: string;
  lessonsLearned?: string;
  outcomeSummary?: string;
  progressPercentage: number;
  progressRagStatus: InitiativeRagLabel;
  /**
   * FRD lifecycle: calculated progress has reached 100% on a configured plan, so the initiative is
   * waiting only on an authorised completion decision. Distinct from `status` — readiness never
   * sets `Completed` by itself.
   */
  isReadyForCompletion: boolean;
  /** Why the initiative cannot be completed yet, or null when it can. Calculated by the backend. */
  notReadyReason?: string | null;
  totalMilestoneWeight: number;
  milestoneWeightsAreValid: boolean;
  budgetPosition: InitiativeBudget;
  milestones: Milestone[];
  dependencies: InitiativeDependency[];
}

export interface InitiativeSummary {
  totalInitiatives: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  onHold: number;
  cancelled: number;
  closed: number;
  averageProgressPercentage: number;
  budgetUtilizationPercent: number | null;
  totalPlannedBudget: number;
  totalActualExpenditure: number;
  totalBudgetVariance: number;
  overdueInitiatives: number;
  upcomingMilestones: number;
}

export interface CreateInitiativeRequest {
  name: string;
  description?: string;
  goalId?: string;
  kraId?: string;
  kpiId?: string;
  ownerId: string;
  priority?: InitiativePriority;
  status?: InitiativeStatus;
  startDate?: string;
  endDate?: string;
  budget: number;
  resources?: string;
}

export interface UpdateInitiativeRequest {
  name?: string;
  description?: string;
  goalId?: string;
  kraId?: string;
  kpiId?: string;
  clearStrategicLinks?: boolean;
  /** Set by forms that render every strategic select: the three ids are an authoritative snapshot. */
  strategicLinksSpecified?: boolean;
  ownerId?: string;
  priority?: InitiativePriority;
  status?: InitiativeStatus;
  startDate?: string;
  endDate?: string;
  budget?: number;
  actualExpenditure?: number;
  resources?: string;
}

export interface CreateMilestoneRequest {
  name: string;
  description?: string;
  completionPercentage: number;
  dueDate: string;
  weight: number;
  status?: MilestoneStatus;
  comments?: string;
}

export interface UpdateMilestoneRequest {
  name?: string;
  description?: string;
  completionPercentage?: number;
  dueDate?: string;
  weight?: number;
  status?: MilestoneStatus;
  comments?: string;
}

export interface UpdateMilestoneProgressRequest {
  completionPercentage: number;
  status?: MilestoneStatus;
  comments?: string;
}

export interface CloseInitiativeRequest {
  actualEndDate: string;
  finalActualExpenditure?: number;
  outcomeSummary?: string;
  lessonsLearned?: string;
}

export interface InitiativeListQuery {
  search?: string;
  status?: InitiativeStatus;
  priority?: InitiativePriority;
  ownerId?: string;
  includeClosed?: boolean;
  page?: number;
  pageSize?: number;
}