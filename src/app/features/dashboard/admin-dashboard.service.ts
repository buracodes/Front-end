import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiEndpoint } from '../../core/constant/ApiEndpoints';
import { IResponse } from '../../core/model/interface/response.interface';
import { ApiService } from '../../core/service/apiService/api-service';
import { AdminUserService } from '../admin-users/admin-users.service';
import { DivisionService } from '../division/division.service';
import {
  DashboardActivityItem,
  DashboardOverview,
  DashboardPendingActionItem,
  DashboardSummary,
  PendingAction,
  QuickAction,
  RecentActivity,
} from './admin-dashboard.model';

/**
 * Aggregates the Admin Dashboard from the SPMS dashboard API plus the
 * strategic-scorecard workspace state.
 *
 * The headline counts, role-based tiles/insight, quick links, pending actions
 * and recent activity come from `GET /api/dashboard/{summary,overview,pending-actions,activity}`.
 * The user/division counts come from their own services. If the dashboard API
 * is unavailable the component falls back to locally derived/sample data.
 */
@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly api = inject(ApiService);
  private readonly adminUserService = inject(AdminUserService);
  private readonly divisionService = inject(DivisionService);

  getUserCount(): Observable<number> {
    return this.adminUserService.getAll().pipe(map((users) => users.length));
  }

  getDivisionCount(): Observable<number> {
    return this.divisionService.getAll().pipe(map((divisions) => divisions.length));
  }

  getSummary(): Observable<DashboardSummary> {
    return this.api.get<IResponse<DashboardSummary>>(`${ApiEndpoint.Dashboard}/summary`).pipe(map((r) => r.data!));
  }

  getOverview(): Observable<DashboardOverview> {
    return this.api.get<IResponse<DashboardOverview>>(`${ApiEndpoint.Dashboard}/overview`).pipe(map((r) => r.data!));
  }

  getPendingActions(): Observable<DashboardPendingActionItem[]> {
    return this.api
      .get<IResponse<DashboardPendingActionItem[]>>(`${ApiEndpoint.Dashboard}/pending-actions`)
      .pipe(map((r) => r.data ?? []));
  }

  getRecentActivity(): Observable<DashboardActivityItem[]> {
    return this.api
      .get<IResponse<DashboardActivityItem[]>>(`${ApiEndpoint.Dashboard}/activity`)
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * Quick actions are role-based quick links from `dashboard/overview`, matched
   * to a local icon; falls back to the sample grid when the API is offline.
   */
  getQuickActions(): Observable<QuickAction[]> {
    return this.api
      .get<IResponse<DashboardOverview>>(`${ApiEndpoint.Dashboard}/overview`)
      .pipe(map((r) => this.toQuickActions(r.data?.quickLinks ?? [])));
  }

  private toQuickActions(links: DashboardQuickLinkShape[]): QuickAction[] {
    if (!links.length) return SAMPLE_QUICK_ACTIONS;
    return links.map((link) => ({
      ...(QUICK_ACTION_TEMPLATES[link.label] ?? { icon: SAMPLE_QUICK_ACTIONS[0].icon }),
      label: link.label,
      route: link.route,
    }));
  }
}

interface DashboardQuickLinkShape {
  label: string;
  route: string;
}

const QUICK_ACTION_TEMPLATES: Record<string, Pick<QuickAction, 'icon'>> = {
  'Manage Users': { icon: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8-4v6m-3-3h6' },
  'Manage Roles': { icon: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 5v6m-3-3h6' },
  'Fiscal Years': { icon: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z' },
  'Data Locking': { icon: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm2-3V7a5 5 0 0 1 10 0v1H7z' },
  'Scorecard Management': { icon: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z' },
  'Data Management': { icon: 'M3 7v6a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3M3 7l6 4m12-4-6 4m-6 0v5m0 0h6m-6 0v5h6' },
  'Initiatives': { icon: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 5v6m-3-3h6' },
  'Scorecard Performance': { icon: 'M18 20V10M12 20V4M6 20v-6' },
  'Reports': { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6m-3 3h6' },
  'Enter Actuals': { icon: 'M16 16l-4-4-4 4M12 12v9' },
};

/** Sample fallbacks used only while the dashboard API is offline. */
export const FALLBACK_PENDING_ACTIONS: PendingAction[] = [
  {
    key: 'missing-targets',
    icon: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01',
    title: 'KPI target configuration',
    description: 'Annual, quarterly and monthly targets not yet configured.',
    count: 4,
    priority: 'High',
    route: '/kpis',
  },
  {
    key: 'pending-submissions',
    icon: 'M16 16l-4-4-4 4M12 12v9M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3',
    title: 'Actual data submissions pending',
    description: 'Open fiscal periods awaiting manual actual entries.',
    count: 3,
    priority: 'High',
    route: '/data-entry',
  },
  {
    key: 'awaiting-review',
    icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4l3 3',
    title: 'Scorecards awaiting review',
    description: 'Scorecards pending final review and sign-off.',
    count: 2,
    priority: 'Medium',
    route: '/scorecards/manage',
  },
  {
    key: 'lock-approaching',
    icon: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm2-3V7a5 5 0 0 1 10 0v1H7z',
    title: 'Period lock approaching',
    description: 'Entry windows closing within the next 3 days.',
    count: 1,
    priority: 'Low',
    route: '/data-locking',
  },
];

export const FALLBACK_RECENT_ACTIVITY: RecentActivity[] = [
  {
    icon: 'M9 12l2 2 4-4m7 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    description: 'KPI target configured — Trade value growth rate',
    user: 'Bethlehem Tekle',
    timestamp: 'Today · 09:42',
  },
  {
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6m-3 3h6',
    description: 'Scorecard created — Operations Division 2026/2027',
    user: 'Dawit Abebe',
    timestamp: 'Today · 08:15',
  },
  {
    icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    description: 'Actual data uploaded — Q1 July',
    user: 'Sara Mohammed',
    timestamp: 'Yesterday · 17:30',
  },
];

const SAMPLE_QUICK_ACTIONS: QuickAction[] = [
  {
    icon: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z',
    label: 'Create fiscal year scorecard',
    route: '/scorecards/manage',
  },
  {
    icon: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 5v6m-3-3h6',
    label: 'Add goal',
    route: '/scorecards/manage',
  },
  {
    icon: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8-4v6m-3-3h6',
    label: 'Add user',
    route: '/admin/users',
  },
  {
    icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v12',
    label: 'Upload data',
    route: '/data-entry',
  },
  {
    icon: 'M18 20V10M12 20V4M6 20v-6',
    label: 'View reports',
    route: '/reports',
  },
];