import { Component, inject, signal, computed } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toApiError } from '../core/model/api-error';
import { UserStore } from '../core/service/user-store.service';
import { AuthService } from '../core/service/auth.service';
import { NotificationService } from '../core/service/notification.service';
import { PASSWORD_REQUIREMENTS_MESSAGE, passwordPolicyValidator } from '../core/validation/password-policy';
import { Toaster } from '../shared/reusableComponent/toaster/toaster';
import { ConfirmDialog } from '../shared/reusableComponent/confirm-dialog/confirm-dialog';
import { LucideDynamicIcon } from '@lucide/angular';

interface NavItem {
  label: string;
  route?: string;
  /** Lucide icon slug, resolved through the registry in core/icon/app-icons. */
  icon: string;
  permission?: string;
  children?: NavItem[];
  isGroup?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ReactiveFormsModule,
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
  private readonly router = inject(Router);

  readonly sidebarCollapsed = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly expandedGroups = signal<Set<string>>(new Set());
  readonly profileOpen = signal(false);

  readonly showPasswordForm = signal(false);
  readonly changingPassword = signal(false);

  readonly passwordRequirementsMessage = PASSWORD_REQUIREMENTS_MESSAGE;

  readonly passwordForm = new FormGroup({
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, passwordPolicyValidator()],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

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
      label: 'scorecards',
      route: '/scorecards',
      icon: 'layout-list',
    },
    {
      label: 'Fiscal Years',
      route: '/admin/fiscal-years',
      icon: 'calendar-days',
      permission: 'admin:config.manage',
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
        },
        // {
        //   label: 'Scorecard Clone',
        //   route: '/scorecard-clone',
        //   icon: 'files',
        //   permission: 'scorecard:clone',
        // },
      ],
    },
    {
      label: 'Initiatives',
      route: '/initiatives',
      icon: 'square-plus',
      permission: 'initiatives:view',
    },
    {
      label: 'Monitoring & Reports',
      route: '/reports',
      icon: 'file-text',
      permission: 'reports:view',
    },
    {
      label: 'Actuals & Data',
      route: '/actuals-data',
      icon: 'clipboard-list',
      permission: 'actuals:view',
    },
    {
      label: 'Data Management',
      route: '/data-management',
      icon: 'files',
      permission: 'data:upload',
    },
    {
      label: 'Divisions',
      route: '/divisions',
      icon: 'layout-grid',
      permission: 'divisions:view',
    },
    {
      label: 'Administration',
      icon: 'shield-check',
      isGroup: true,
      children: [
        {
          label: 'Users',
          route: '/admin/users',
          icon: 'users',
          permission: 'admin:users.manage',
        },
        {
          label: 'Roles',
          route: '/admin/roles',
          icon: 'shield',
          permission: 'admin:roles.manage',
        },
      ],
    },
  ];

  readonly visibleNavItems = computed(() =>
    this.navItems.filter(
      (item) => !item.permission || this.userStore.hasPermission(item.permission)
    )
  );

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

  openPasswordModal(): void {
    this.passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    this.showPasswordForm.set(true);
  }

  closePasswordModal(): void {
    this.passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    this.showPasswordForm.set(false);
  }

  changePassword(): void {
    if (this.passwordForm.invalid || this.changingPassword()) {
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();

    if (newPassword !== confirmPassword) {
      this.notifications.error('New password and confirmation do not match.');
      return;
    }

    this.changingPassword.set(true);

    this.authService.changePassword({ currentPassword, newPassword, confirmPassword }).subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.closePasswordModal();
        this.notifications.success('Password changed. Please sign in with your new password.');
        this.router.navigate(['/login']);
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.changingPassword.set(false);
      },
    });
  }
}