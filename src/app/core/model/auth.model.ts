export interface LoginRequest {
  username: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  divisionId?: string;
  /** Every division this account is authorized for; the primary division is first. */
  divisionIds?: string[];
  /** Null until the account's first successful sign-in. */
  lastLoginAtUtc?: string | null;
  roles: string[];
  permissions: string[];
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAtUtc: string;
  user: AuthUser;
}
