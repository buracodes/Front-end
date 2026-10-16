export interface AppUser {
  id: string;
  username: string;
  email?: string;
  fullName: string;
  isActive: boolean;
  lastLoginAtUtc?: string;
  roles: string[];
}
