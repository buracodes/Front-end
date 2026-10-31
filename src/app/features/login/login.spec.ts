import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideAppIcons } from '../../core/icon/app-icons';
import { AuthService } from '../../core/service/auth.service';
import { NotificationService } from '../../core/service/notification.service';
import { LoginPage } from './login';

describe('LoginPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideAppIcons(),
        { provide: AuthService, useValue: { login: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: NotificationService, useValue: { success: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('toggles password visibility without submitting the form', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('#password') as HTMLInputElement;
    const showButton = host.querySelector('button[aria-label="Show password"]') as HTMLButtonElement;

    expect(input.type).toBe('password');
    expect(showButton.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('svg.lucide-eye')).not.toBeNull();

    showButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input.type).toBe('text');
    const hideButton = host.querySelector('button[aria-label="Hide password"]') as HTMLButtonElement;
    expect(hideButton).not.toBeNull();
    expect(hideButton.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('svg.lucide-eye-off')).not.toBeNull();

    hideButton.click();
    fixture.detectChanges();

    expect(input.type).toBe('password');
  });
});
