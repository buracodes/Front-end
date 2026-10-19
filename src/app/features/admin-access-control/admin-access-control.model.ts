/** Backend-computed access-control types (dynamic RBAC, delivered by /api/accesscontrol). */

export interface AccessSummary {
  totalGroups: number;
  totalRights: number;
  groupMembershipAssignments: number;
  directGrantAssignments: number;
  directDenyAssignments: number;
}

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

export interface AccessDirectoryUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  isActive: boolean;
  lastLoginAtUtc: string | null;
  divisionId: string | null;
  divisionName: string | null;
  groupNames: string[];
}

export interface AccessUserDetail {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  isActive: boolean;
  divisionId: string | null;
  divisionName: string | null;
  lastLoginAtUtc: string | null;
  groupNames: string[];
  unassignedGroupsCount: number;
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

export interface EffectiveAccessEntry {
  permissionId: string;
  permissionName: string;
  module: string;
  description: string | null;
  /** 'Granted' | 'Denied' */
  result: string;
  /** 'Direct User Assignment' | 'Group Assignment' | 'Default Deny' */
  source: string;
  hasExplicitDeny: boolean;
  explanation: string;
}

export interface EffectiveAccessResult {
  userId: string;
  username: string;
  fullName: string;
  isActive: boolean;
  groupNames: string[];
  rights: EffectiveAccessEntry[];
}

export interface AuthorizationAuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  performedByName: string | null;
  performedAt: string;
  reason: string | null;
  oldValues: string | null;
  newValues: string | null;
}

export type AccessEffect = 'Grant' | 'Deny';
