import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShellComponent } from './shell';
import { AuthService } from '../core/service/auth.service';
import { NotificationService } from '../core/service/notification.service';
import { UserStore } from '../core/service/user-store.service';
import { AuthUser } from '../core/model/auth.model';
import { provideAppIcons } from '../core/icon/app-icons';

const user = (roles: string[] = ['PowerUser']): AuthUser => ({
  id: 'user-1',
  username: 'admin',
  fullName: 'System Administrator',
  email: 'admin@spms.local',
  roles,
  permissions: [],
});

describe('ShellComponent', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let host: HTMLElement;
  let notifications: NotificationService;
  let logoutCalls = 0;

  const start = (): ShellComponent => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([]),
        provideAppIcons(),
        { provide: AuthService, useValue: { logout: () => logoutCalls++ } },
      ],
    });
    TestBed.inject(UserStore).setUser(user());
    notifications = TestBed.inject(NotificationService);

    fixture = TestBed.createComponent(ShellComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    return fixture.componentInstance;
  };

  const openMenu = (): void => {
    (host.querySelector('.profile-trigger') as HTMLElement).click();
    fixture.detectChanges();
  };

  const findItem = (label: string): HTMLElement =>
    Array.from(host.querySelectorAll<HTMLElement>('.profile-menu button')).find((button) =>
      button.textContent?.includes(label)
    )!;

  beforeEach(() => {
    logoutCalls = 0;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows the signed-in user name and roles in the top bar', () => {
    start();
    expect(host.querySelector('.user-name')!.textContent).toContain('System Administrator');
    expect(host.querySelector('.user-role')!.textContent).toContain('PowerUser');
  });

  it('opens the profile menu with Notifications and Sign out', () => {
    start();
    expect(host.querySelector('.profile-menu')).toBeNull();

    openMenu();
    const items = Array.from(host.querySelectorAll('.profile-menu button')).map((button) =>
      button.textContent?.trim()
    );
    expect(items).toEqual(['Notifications', 'Sign out']);
  });

  it('closes the menu when the backdrop is clicked', () => {
    start();
    openMenu();
    expect(host.querySelector('.profile-menu')).not.toBeNull();

    (host.querySelector('.profile-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(host.querySelector('.profile-menu')).toBeNull();
  });

  it('signs out and closes the menu', () => {
    start();
    openMenu();
    findItem('Sign out').click();
    fixture.detectChanges();
    expect(logoutCalls).toBe(1);
    expect(host.querySelector('.profile-menu')).toBeNull();
  });

  it('raises a notification toast from Notifications', () => {
    start();
    openMenu();
    const before = notifications.toasts().length;
    findItem('Notifications').click();
    fixture.detectChanges();
    expect(notifications.toasts().length).toBe(before + 1);
    expect(notifications.toasts().at(-1)?.message).toBe('No new notifications.');
  });

  it('collapses the sidebar and expands it again from the same button', () => {
    start();
    const sidebar = host.querySelector('.sidebar') as HTMLElement;
    const toggle = () => {
      (host.querySelector('.sidebar-collapse-btn') as HTMLElement).click();
      fixture.detectChanges();
    };

    expect(sidebar.classList.contains('collapsed')).toBe(false);
    toggle();
    expect(sidebar.classList.contains('collapsed')).toBe(true);
    toggle();
    expect(sidebar.classList.contains('collapsed')).toBe(false);
  });

  it('points the collapse chevron the way back to full width while collapsed', () => {
    start();
    (host.querySelector('.sidebar-collapse-btn') as HTMLElement).click();
    fixture.detectChanges();

    const chevron = host.querySelector('.sidebar-collapse-btn svg') as SVGSVGElement;
    expect(chevron.classList.contains('lucide-chevron-right')).toBe(true);
    expect(chevron.classList.contains('lucide-chevron-left')).toBe(false);
  });

  it('opens the mobile drawer as a full-width rail even when the sidebar was collapsed', () => {
    start();
    (host.querySelector('.sidebar-collapse-btn') as HTMLElement).click();
    fixture.detectChanges();
    const sidebar = host.querySelector('.sidebar') as HTMLElement;
    expect(sidebar.classList.contains('collapsed')).toBe(true);

    (host.querySelector('.mobile-hamburger') as HTMLElement).click();
    fixture.detectChanges();
    expect(sidebar.classList.contains('collapsed')).toBe(false);
    expect(sidebar.classList.contains('mobile-open')).toBe(true);
  });
});

describe('ShellComponent navigation permissions', () => {
  /** Every menu label the persona can reach, flattening the grouped entries. */
  const labelsFor = (permissions: string[]): string[] => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([]),
        provideAppIcons(),
        { provide: AuthService, useValue: { logout: () => undefined } },
      ],
    });
    TestBed.inject(UserStore).setUser({
      id: 'user-1',
      username: 'entry.user',
      fullName: 'Entry User',
      email: 'entry.user@spms.local',
      roles: ['DataInputUser'],
      permissions,
    });

    const shellFixture = TestBed.createComponent(ShellComponent);
    shellFixture.detectChanges();
    const shell = shellFixture.componentInstance;
    return shell.visibleNavItems().flatMap((item) => [item.label, ...(item.children ?? []).map((child) => child.label)]);
  };

  afterEach(() => TestBed.resetTestingModule());

  it('offers the entry persona only Data Entry from the scorecard pages', () => {
    const labels = labelsFor([
      'dashboard:view',
      'division:scorecard.view',
      'division:performance.view',
      'actuals:view',
      'actuals:enter',
    ]);

    expect(labels).toContain('Data Entry');
    expect(labels).not.toContain('Scorecards');
    expect(labels).not.toContain('Goals');
    expect(labels).not.toContain('KRAs');
    expect(labels).not.toContain('KPIs');
    expect(labels).not.toContain('Targets');
    expect(labels).not.toContain('Scorecard Clone');
    // Lock administration is not an entry surface: reporting already shows the window status.
    expect(labels).not.toContain('Data Locking');
  });

  it('keeps the scorecard catalog open for a principal that can view it', () => {
    const labels = labelsFor([
      'dashboard:view',
      'scorecard:view',
      'goals:view',
      'kra:view',
      'kpi:view',
      'targets:view',
      'actuals:view',
    ]);

    expect(labels).toContain('Scorecards');
    expect(labels).toContain('Targets');
    expect(labels).toContain('Data Entry');
    expect(labels).not.toContain('Data Locking');
  });

  it('opens Data Locking to the account that configures locks', () => {
    expect(labelsFor(['actuals:view', 'admin:config.manage'])).toContain('Data Locking');
  });

  it('opens Data Locking to the account that overrides locked periods', () => {
    expect(labelsFor(['actuals:view', 'kpi:override'])).toContain('Data Locking');
  });

  it('hides Division Planning from principals without divisions:plan', () => {
    const labels = labelsFor([
      'dashboard:view',
      'organization:view',
      'division:scorecard.view',
      'division:performance.view',
      'division:initiative.view',
      'actuals:view',
    ]);

    expect(labels).not.toContain('Division Planning');
  });

  it('shows Division Planning to the plan authors', () => {
    expect(labelsFor(['dashboard:view', 'division:scorecard.view', 'divisions:plan'])).toContain(
      'Division Planning'
    );
  });
});