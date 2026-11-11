import { validateAuthEmail, validateAuthPassword, type AuthInputCheck } from './authInputSecurity';

/** Internal mailbox for username accounts. Customers never see or type this. */
const CUSTOMER_USERNAME_DOMAIN = 'customer.watermarket.ph';

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function sanitizeCustomerUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

export function sanitizeCustomerLogin(raw: string): string {
  return raw.replace(/[\x00-\x1F\x7F]/g, '').replace(/[^a-zA-Z0-9_@.+-]/g, '').slice(0, 254);
}

export function validateCompleteName(raw: string): AuthInputCheck {
  const value = raw.replace(/[\x00-\x1F\x7F]/g, '').trim().replace(/\s+/g, ' ');
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2 || value.length > 80) {
    return { ok: false, error: 'Please enter your complete name.' };
  }
  return { ok: true, value };
}

export function validateCustomerUsername(raw: string): AuthInputCheck {
  const value = sanitizeCustomerUsername(raw.trim());
  if (!value) return { ok: false, error: 'Please choose a username.' };
  if (!USERNAME_PATTERN.test(value)) {
    return { ok: false, error: 'Username must be 3 to 20 letters or numbers, with no spaces.' };
  }
  return { ok: true, value };
}

export function customerUsernameEmail(username: string): string {
  return `${username}@${CUSTOMER_USERNAME_DOMAIN}`;
}

export function customerLoginEmail(login: string): { ok: true; email: string } | { ok: false; error: string } {
  const value = login.trim();
  if (!value) return { ok: false, error: 'Please enter your username.' };
  if (value.includes('@')) {
    const email = validateAuthEmail(value);
    if (!email.ok) return email;
    return { ok: true, email: email.value };
  }
  const username = validateCustomerUsername(value);
  if (!username.ok) return username;
  return { ok: true, email: customerUsernameEmail(username.value) };
}

export function validateCustomerPassword(raw: string) {
  return validateAuthPassword(raw, { mode: 'signup' });
}

export function usernameTakenMessage(raw: string): string | null {
  const message = raw.toLowerCase();
  if (
    message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('already exists') ||
    message.includes('user already') ||
    message.includes('duplicate') ||
    message.includes('unique')
  ) {
    return 'That username is already used. Please choose another.';
  }
  return null;
}
