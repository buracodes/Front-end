import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UserStore } from '../core/service/user-store.service';
import { AuthService } from '../core/service/auth.service';
import { NotificationService } from '../core/service/notification.service';
import { Toaster } from '../shared/reusableComponent/toaster/toaster';
import { ConfirmDialog } from '../shared/reusableComponent/confirm-dialog/confirm-dialog';
import { LucideDynamicIcon } from '@lucide/angular';

interface NavItem {
  label: string;
  route?: string;
  /** Lucide icon slug, resolved through the registry in core/icon/app-icons. */
  icon: string;
  /** Required capability; an array means "any of these" (matches permissionGuard). */
  permission?: string | string[];
  children?: NavItem[];
  isGroup?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Toaster,
    ConfirmDialog,
    LucideDynamicIcon,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class ShellComponent {
  readonly userStore = inject(UserStore);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  readonly sidebarCollapsed = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly expandedGroups = signal<Set<string>>(new Set());
  readonly profileOpen = signal(false);

  readonly navItems: NavItem[] = [
    {
      label: 'Dashboard',
      route: '/dashboard',
      icon: 'layout-dashboard',
    },
    {
      label: 'Org Profile',
      route: '/org-profile',
      icon: 'building',
      permission: 'organization:view',
    },
    {
      label: 'Fiscal Years',
      route: '/admin/fiscal-years',
      icon: 'calendar-days',
      permission: 'admin:config.manage',
    },
    {
      label: 'Scorecards',
      route: '/scorecards',
      icon: 'layout-list',
      permission: 'scorecard:view',
    },
    {
      // Read-only view of the employee's own division scorecard and KPIs. Baseline
      // employees reach it without a scorecard id; the page resolves their own plan.
      label: 'Division Scorecard',
      route: '/division-planning',
      icon: 'chart-pie',
      permission: ['divisions:view', 'division:scorecard.view', 'division:performance.view'],
    },
    {
      label: 'Strategic Scorecard',
      icon: 'chart-column',
      isGroup: true,
      children: [
        // {
        //   label: 'scorecardss',
        //   route: '/scorecardss',
        //   icon: 'layout-list',
        //   permission: 'scorecard:view',
        // },
        {
          label: 'Goals',
          route: '/goals',
          icon: 'target',
          permission: 'goals:view',
        },
        {
          label: 'KRAs',
          route: '/kras',
          icon: 'list-checks',
          permission: 'kra:view',
        },
        {
          label: 'KPIs',
          route: '/kpis',
          icon: 'gauge',
          permission: 'kpi:view',
        },
        {
          label: 'Targets',
          route: '/targets',
          icon: 'layers',
          permission: 'targets:view',
        },
        {
          label: 'Data Entry',
          route: '/data-entry',
          icon: 'notebook-pen',
          permission: 'actuals:view',
        },
        {
          label: 'Data Locking',
          route: '/data-locking',
          icon: 'lock',
          permission: ['actuals:view', 'admin:config.manage'],
        },
        {
          label: 'Scorecard Clone',
          route: '/scorecard-clone',
          icon: 'files',
          permission: 'scorecard:clone',
        },
      ],
    },
    {
      label: 'Initiatives',
      route: '/initiatives',
      icon: 'square-plus',
      permission: ['initiatives:view', 'division:initiative.view'],
    },
    {
      label: 'Performance Monitoring',
      route: '/performance-monitoring',
      icon: 'activity',
      permission: ['dashboard:view', 'division:performance.view'],
    },
    {
      label: 'Reports',
      route: '/reports',
      icon: 'file-text',
      permission: 'reports:view',
    },
    // {
    //   label: 'Data Management',
    //   route: '/data-management',
    //   icon: 'files',
    //   permission: 'data:upload',
    // },
    // {
    //   label: 'Divisions',
    //   route: '/divisions',
    //   icon: 'layout-grid',
    //   permission: 'divisions:view',
    // },
    {
      label: 'Role Management',
      icon: 'shield-check',
      isGroup: true,
      children: [
        {
          label: 'Access Control',
          route: '/admin/access-control',
          icon: 'key-square',
          permission: 'admin:access.view',
        },
        {
          label: 'Users',
          route: '/admin/users',
          icon: 'users',
          permission: 'admin:users.manage',
        },
        {
          label: 'RAG Thresholds',
          route: '/admin/rag-thresholds',
          icon: 'traffic-cone',
          permission: 'admin:rag.thresholds.manage',
        },
      ],
    },
  ];

  readonly visibleNavItems = computed(() => {
    const canAccess = (permission?: string | string[]): boolean => {
      if (!permission) {
        return true;
      }
      const required = Array.isArray(permission) ? permission : [permission];
      return this.userStore.hasAnyPermission(required);
    };

    return this.navItems
      .map((item) =>
        item.children
          ? { ...item, children: item.children.filter((child) => canAccess(child.permission)) }
          : item
      )
      .filter((item) => {
        if (!canAccess(item.permission)) {
          return false;
        }
        // A group whose children are all hidden would render an empty, dead menu entry.
        return !(item.children && item.children.length === 0);
      });
  });

  toggleGroup(label: string): void {
    this.expandedGroups.update((groups) => {
      const newGroups = new Set(groups);
      if (newGroups.has(label)) {
        newGroups.delete(label);
      } else {
        newGroups.add(label);
      }
      return newGroups;
    });
  }

  isGroupExpanded(label: string): boolean {
    return this.expandedGroups().has(label);
  }

  get initials(): string {
    const fullName = this.userStore.user()?.fullName ?? '';
    return fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleMobileMenu(): void {
    if (!this.mobileMenuOpen()) {
      // A collapsed rail has no room to show navigation text, so the mobile drawer
      // always opens expanded - otherwise a previously-collapsed sidebar would be
      // stuck in its 64px rail with no way to widen it on narrow screens.
      this.sidebarCollapsed.set(false);
    }
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleProfile(): void {
    this.profileOpen.update((open) => !open);
  }

  closeProfile(): void {
    this.profileOpen.set(false);
  }

  openNotifications(): void {
    this.notifications.info('No new notifications.');
  }

  logout(): void {
    this.authService.logout();
  }
}