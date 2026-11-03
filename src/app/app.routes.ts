import { Routes } from '@angular/router';
import { authGuard } from './core/guard/auth.guard';
import { guestGuard } from './core/guard/guest.guard';
import { permissionGuard } from './core/guard/permission.guard';

/**
 * Legacy planning/administration rights and the baseline division views both reach these
 * read-only pages. The server still applies the employee's HR division scope to every read.
 */
const DIVISION_SCORECARD_ACCESS = ['divisions:view', 'division:scorecard.view', 'division:performance.view'];
const INITIATIVE_ACCESS = ['initiatives:view', 'division:initiative.view'];
const PERFORMANCE_ACCESS = ['dashboard:view', 'division:performance.view'];

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'org-profile',
        canActivate: [permissionGuard('organization:view')],
        loadComponent: () => import('./features/org-profile/org-profile').then((m) => m.OrgProfilePage),
      },
      {
        path: 'scorecards',
        canActivate: [permissionGuard('scorecard:view')],
        loadComponent: () => import('./features/scorecard/scorecard').then((m) => m.ScorecardPage),
      },
      {
        path: 'scorecards/manage',
        canActivate: [permissionGuard('scorecard:view')],
        loadComponent: () => import('./features/scorecard/scorecard').then((m) => m.ScorecardPage),
      },
      {
        path: 'scorecards/:id',
        canActivate: [permissionGuard('scorecard:view')],
        loadComponent: () => import('./features/score-plann/score').then((m) => m.score),
      },
      {
        // Baseline employees land here without a scorecard id; the page resolves their own
        // division's plan. The backend still decides which division and scorecard that is.
        path: 'division-planning',
        canActivate: [permissionGuard(DIVISION_SCORECARD_ACCESS)],
        loadComponent: () =>
          import('./features/division-planning/division-planning').then((m) => m.DivisionPlanningPage),
      },
      {
        path: 'division-planning/:scorecardId',
        canActivate: [permissionGuard(DIVISION_SCORECARD_ACCESS)],
        loadComponent: () =>
          import('./features/division-planning/division-planning').then((m) => m.DivisionPlanningPage),
      },
      {
        path: 'goals',
        canActivate: [permissionGuard('goals:view')],
        loadComponent: () => import('./features/goals/goals').then((m) => m.GoalsPage),
      },
      {
        path: 'kras',
        canActivate: [permissionGuard('kra:view')],
        loadComponent: () => import('./features/kra/kra').then((m) => m.KraPage),
      },
      {
        path: 'kpis',
        canActivate: [permissionGuard('kpi:view')],
        loadComponent: () => import('./features/kpi/kpi').then((m) => m.KpiPage),
      },
      {
        path: 'scorecardss',
        canActivate: [permissionGuard('scorecard:view')],
        loadComponent: () =>
          import('./features/strategic-scorecard/scorecard-layout/scorecard-layout').then((m) => m.ScorecardLayout),
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'performance',
          },
          {
            path: 'performance',
            loadComponent: () =>
              import('./features/strategic-scorecard/performance/performance').then((m) => m.PerformancePage),
          },
        ],
      },
      {
        // Bulk Create Targets, scoped by fiscal year rather than by a single scorecard, so it
        // lives at the top level instead of inside the scorecard workspace layout.
        path: 'targets',
        canActivate: [permissionGuard('targets:view')],
        loadComponent: () =>
          import('./features/strategic-scorecard/targets/targets').then((m) => m.TargetsPage),
      },
      {
        path: 'data-entry',
        canActivate: [permissionGuard('actuals:view')],
        loadComponent: () =>
          import('./features/data-entry/data-entry').then((m) => m.DataEntryPage),
      },
      {
        path: 'target-config',
        canActivate: [permissionGuard('targets:edit')],
        loadComponent: () =>
          import('./features/strategic-scorecard/target-config/target-config').then((m) => m.TargetConfigPage),
      },
      {
        path: 'performance-monitoring',
        canActivate: [permissionGuard(PERFORMANCE_ACCESS)],
        loadComponent: () =>
          import('./features/performance-monitoring/performance-monitoring').then((m) => m.PerformanceMonitoringPage),
      },
      {
        // Viewing period locks only needs actuals:view; the page itself hides the unlock
        // controls unless the user also holds admin:config.manage.
        path: 'data-locking',
        canActivate: [permissionGuard(['actuals:view', 'admin:config.manage'])],
        loadComponent: () =>
          import('./features/data-locking/data-locking').then((m) => m.DataLockingPage),
      },
      {
        path: 'scorecard-clone',
        canActivate: [permissionGuard('scorecard:clone')],
        loadComponent: () =>
          import('./features/strategic-scorecard/scorecard-clone/scorecard-clone').then((m) => m.ScorecardClonePage),
      },
      {
        path: 'data-management',
        canActivate: [permissionGuard('data:upload')],
        loadComponent: () =>
          import('./features/data-management/data-management').then((m) => m.DataManagementPage),
      },
      {
        path: 'divisions',
        canActivate: [permissionGuard('divisions:view')],
        loadComponent: () => import('./features/division/division').then((m) => m.DivisionPage),
      },
      {
        path: 'initiatives',
        canActivate: [permissionGuard(INITIATIVE_ACCESS)],
        loadComponent: () => import('./features/initiative/initiative').then((m) => m.InitiativePage),
      },
      {
        path: 'initiatives/:id',
        canActivate: [permissionGuard(INITIATIVE_ACCESS)],
        loadComponent: () =>
          import('./features/initiative/initiative-detail').then((m) => m.InitiativeDetailPage),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard('reports:view')],
        loadComponent: () => import('./features/reports/reports').then((m) => m.ReportsPage),
      },
      {
        path: 'admin/access-control',
        canActivate: [permissionGuard('admin:access.view')],
        loadComponent: () =>
          import('./features/admin-access-control/admin-access-control').then(
            (m) => m.AdminAccessControlPage,
          ),
      },
      {
        path: 'admin/users',
        canActivate: [permissionGuard('admin:users.manage')],
        loadComponent: () => import('./features/admin-users/admin-users').then((m) => m.AdminUsersPage),
      },
      {
        path: 'admin/rag-thresholds',
        canActivate: [permissionGuard('admin:rag.thresholds.manage')],
        loadComponent: () =>
          import('./features/admin-thresholds/admin-thresholds').then((m) => m.AdminThresholdsPage),
      },
      {
        path: 'admin/fiscal-years',
        canActivate: [permissionGuard('admin:config.manage')],
        loadComponent: () => import('./features/fiscal-year/fiscal-year').then((m) => m.FiscalYearPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
