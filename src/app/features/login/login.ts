import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toApiError } from '../../core/model/api-error';
import { AuthService } from '../../core/service/auth.service';
import { NotificationService } from '../../core/service/notification.service';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly year = new Date().getFullYear();

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.notifications.success('Login successful. Welcome back!');
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.errorMessage.set(toApiError(error).message);
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false),
    });
  }
}
