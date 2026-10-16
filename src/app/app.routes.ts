import { Routes } from '@angular/router';
import { authGuard } from './core/guard/auth.guard';
import { guestGuard } from './core/guard/guest.guard';
import { InitiativeDetailPage } from './features/initiative/initiative-detail';

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
        loadComponent: () => import('./features/org-profile/org-profile').then((m) => m.OrgProfilePage),
      },
      { 
        path: 'scorecards',
        loadComponent: () => import('./features/scorecard/scorecard').then((m) => m.ScorecardPage),
      },
      {
        path: 'scorecards/manage',
        loadComponent: () => import('./features/scorecard/scorecard').then((m) => m.ScorecardPage),
      },
      {
        path: 'scorecards/:id',
        loadComponent: () => import('./features/score-plann/score').then((m) => m.score),
      },
      {
        path: 'division-planning/:scorecardId',
        loadComponent: () =>
          import('./features/division-planning/division-planning').then((m) => m.DivisionPlanningPage),
      },
      {
        path: 'goals',
        loadComponent: () => import('./features/goals/goals').then((m) => m.GoalsPage),
      },
      {
        path: 'kras',
        loadComponent: () => import('./features/kra/kra').then((m) => m.KraPage),
      },
      {
        path: 'kpis',
        loadComponent: () => import('./features/kpi/kpi').then((m) => m.KpiPage),
      },
      {
        path: 'scorecardss',
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
      { path: 'initiatives/:id', component: InitiativeDetailPage },
      {
        // Bulk Create Targets, scoped by fiscal year rather than by a single scorecard, so it
        // lives at the top level instead of inside the scorecard workspace layout.
        path: 'targets',
        loadComponent: () =>
          import('./features/strategic-scorecard/targets/targets').then((m) => m.TargetsPage),
      },
      {
        path: 'data-entry',
        loadComponent: () =>
          import('./features/data-entry/data-entry').then((m) => m.DataEntryPage),
      },
      {
        path: 'target-config',
        loadComponent: () =>
          import('./features/strategic-scorecard/target-config/target-config').then((m) => m.TargetConfigPage),
      },
      {
        path: 'data-locking',
        loadComponent: () =>
          import('./features/data-locking/data-locking').then((m) => m.DataLockingPage),
      },
      {
        path: 'scorecard-clone',
        loadComponent: () =>
          import('./features/strategic-scorecard/scorecard-clone/scorecard-clone').then((m) => m.ScorecardClonePage),
      },
      {
        path: 'data-management',
        loadComponent: () =>
          import('./features/data-management/data-management').then((m) => m.DataManagementPage),
      },
      {
        path: 'divisions',
        loadComponent: () => import('./features/division/division').then((m) => m.DivisionPage),
      },
      {
        path: 'initiatives',
        loadComponent: () => import('./features/initiative/initiative').then((m) => m.InitiativePage),
      },
      {
        path: 'initiatives/:id',
        loadComponent: () =>
          import('./features/initiative/initiative-detail').then((m) => m.InitiativeDetailPage),
      },
      {
        path: 'actuals-data',
        loadComponent: () => import('./features/actuals-data/actuals-data').then((m) => m.ActualsDataPage),
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/reports/reports').then((m) => m.ReportsPage),
      },
      {
        path: 'admin/users',
        loadComponent: () => import('./features/admin-users/admin-users').then((m) => m.AdminUsersPage),
      },
      {
        path: 'admin/roles',
        loadComponent: () => import('./features/admin-roles/admin-roles').then((m) => m.AdminRolesPage),
      },
      {
        path: 'admin/fiscal-years',
        loadComponent: () => import('./features/fiscal-year/fiscal-year').then((m) => m.FiscalYearPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
