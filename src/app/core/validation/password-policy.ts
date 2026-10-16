import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const PASSWORD_MINIMUM_LENGTH = 8;

export const PASSWORD_REQUIREMENTS_MESSAGE =
  `Password must be at least ${PASSWORD_MINIMUM_LENGTH} characters long and include an uppercase letter, a lowercase letter, a digit and a special character.`;

/** Mirrors the server-side `PasswordPolicy` so the user sees problems before submitting. */
export function passwordPolicyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;

    if (!value) {
      return null;
    }

    const satisfiesPolicy =
      value.length >= PASSWORD_MINIMUM_LENGTH &&
      /[A-Z]/.test(value) &&
      /[a-z]/.test(value) &&
      /\d/.test(value) &&
      /[^A-Za-z0-9]/.test(value);

    return satisfiesPolicy ? null : { passwordPolicy: true };
  };
}
