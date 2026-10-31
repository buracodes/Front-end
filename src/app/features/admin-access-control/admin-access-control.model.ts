/** Backend-computed access-control types (dynamic RBAC, delivered by /api/accesscontrol). */

export interface AccessGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  rightCount: number;
  denyCount: number;
  isActive: boolean;
  status: string;
  lastUpdated: string | null;
}

export interface AccessRight {
  id: string;
  name: string;
  module: string;
  description: string | null;
  groupAssignments: number;
  directAssignments: number;
  referenced: boolean;
  status: string;
  lastUpdated: string | null;
}

/** Active employee from the HR database. EmpId is the AD objectGUID and the SPMS user id. */
export interface EmployeeHrInfo {
  empId: string | null;
  idCode: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
  positionId: string | null;
  positionName: string | null;
  positionLevel: string | null;
  divisionId: string | null;
  divisionName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
}

export interface GroupMembershipRow {
  userId: string;
  roleId: string;
  username: string;
  fullName: string;
  roleName: string;
  assignedAt: string;
  assignedByName: string | null;
}

export interface GroupRightRow {
  roleId: string;
  permissionId: string;
  roleName: string;
  permissionName: string;
  module: string;
  /** 'Grant' | 'Deny' */
  effect: string;
  assignedAt: string;
  assignedByName: string | null;
}

export interface UserRightRow {
  userId: string;
  permissionId: string;
  username: string;
  fullName: string;
  permissionName: string;
  module: string;
  /** 'Grant' | 'Deny' */
  effect: string;
  reason: string | null;
  assignedAt: string;
  assignedByName: string | null;
}

export type AccessEffect = 'Grant' | 'Deny';
