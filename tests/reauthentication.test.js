// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ getUser: vi.fn(), signInWithPassword: vi.fn(), mfa: {
  getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challengeAndVerify: vi.fn(),
} }));
vi.mock('../src/supabase', () => ({ supabase: { auth },supabaseConfig:{passkeysEnabled:false} }));
import { AuthProvider } from '../src/lib/providers';
const user = { id: 'owner', email: 'owner@example.invalid' };
const ok = data => ({ data, error: null });
beforeEach(() => {
  vi.resetAllMocks();
  auth.getUser.mockResolvedValue(ok({ user }));
  auth.signInWithPassword.mockResolvedValue(ok({ user, session: { user } }));
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(ok({ currentLevel: 'aal1', nextLevel: 'aal1' }));
  auth.mfa.listFactors.mockResolvedValue(ok({ totp: [{ id: 'factor', status: 'verified' }] }));
  auth.mfa.challengeAndVerify.mockResolvedValue(ok({}));
});
it('accepts verified password-only accounts', async () => {
  await expect(AuthProvider.reauthenticate('test-password')).resolves.toMatchObject({ user });
});
it.each([null, {}, { currentLevel: 'aal1', nextLevel: null }])('fails closed on unavailable MFA assurance: %j', async value => {
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(ok(value));
  await expect(AuthProvider.reauthenticate('test-password')).rejects.toMatchObject({ code: 'MFA_UNAVAILABLE' });
});
it('does not accept challenge success without established AAL2', async () => {
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(ok({ currentLevel: 'aal1', nextLevel: 'aal2' }));
  await expect(AuthProvider.reauthenticate('test-password', '123456')).rejects.toMatchObject({ code: 'MFA_REQUIRED' });
});
it('accepts MFA only after checking the resulting assurance', async () => {
  auth.mfa.getAuthenticatorAssuranceLevel
    .mockResolvedValueOnce(ok({ currentLevel: 'aal1', nextLevel: 'aal2' }))
    .mockResolvedValueOnce(ok({ currentLevel: 'aal2', nextLevel: 'aal2' }));
  await expect(AuthProvider.reauthenticate('test-password', '123456')).resolves.toMatchObject({ user });
});
it('rejects an account switch during verification', async () => {
  auth.getUser.mockResolvedValueOnce(ok({ user })).mockResolvedValueOnce(ok({ user: { id: 'other' } }));
  await expect(AuthProvider.reauthenticate('test-password')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
});
