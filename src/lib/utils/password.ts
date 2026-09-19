// Client-side password policy validation (mirrors the backend policy for UX:
// min 8 chars, at least 1 uppercase, at least 1 special character).
// The backend is the authoritative check; this is only for fast local
// feedback.

export interface PasswordValidation {
	ok: boolean;
	errors: string[];
}

// Mirrors the backend policy: min 8, ≥1 uppercase, ≥1 special char.
export const minPasswordLength = 8;

export function isValidPassword(password: string): PasswordValidation {
	const errors: string[] = [];
	if (password.length < minPasswordLength) {
		errors.push(`senha deve ter no mínimo ${minPasswordLength} caracteres`);
	}
	if (!/[A-Z]/.test(password)) {
		errors.push('senha deve conter ao menos 1 letra maiúscula');
	}
	if (!/[^A-Za-z0-9]/.test(password)) {
		errors.push('senha deve conter ao menos 1 caractere especial');
	}
	return { ok: errors.length === 0, errors };
}

// Checks whether a password meets the policy, returning the list of violated
// rules (empty when valid).
export function passwordErrors(password: string): string[] {
	return isValidPassword(password).errors;
}
