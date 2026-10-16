export interface Role {
  id: string;
  name: string;
  description?: string;
  userCount: number;
  permissionCount: number;
}

export interface RoleDetail {
  id: string;
  name: string;
  description?: string;
  userCount: number;
  permissions: PermissionItem[];
}

export interface PermissionItem {
  id: string;
  name: string;
  module: string;
  description?: string;
  isAssigned: boolean;
}
