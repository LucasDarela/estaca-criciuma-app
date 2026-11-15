import '@/i18n';

import { act, render } from '@testing-library/react-native';

import i18n from '@/i18n';
import { signOut, useAuthSession } from '@/lib/authSession';

import { SessionEffects } from './SessionEffects';

const mockShow = jest.fn();
let mockPathname = '/agenda';
let mockViewer: Record<string, unknown> = {};

jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));
jest.mock('@/components/toast/ToastProvider', () => ({ useToast: () => ({ show: mockShow }) }));
jest.mock('@/lib/authSession', () => ({ signOut: jest.fn(), useAuthSession: jest.fn() }));
jest.mock('../viewer/ViewerProvider', () => ({ useViewer: () => mockViewer }));

const signedIn = { status: 'signedIn', userId: 'u1', email: 'a@b.co' };
const consented = { locale: 'pt-BR', consentedAt: '2026-11-15T00:00:00Z' };

beforeEach(async () => {
  jest.clearAllMocks();
  mockPathname = '/agenda';
  mockViewer = { userId: 'u1', loaded: true, profile: consented };
  (useAuthSession as jest.Mock).mockReturnValue(signedIn);
  await i18n.changeLanguage('pt-BR');
});

describe('SessionEffects', () => {
  it('CA-09: signs out a signed-in account without consent', async () => {
    mockViewer = { userId: 'u1', loaded: true, profile: { locale: 'pt-BR', consentedAt: null } };
    await render(<SessionEffects />);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the account has no profile at all', async () => {
    mockViewer = { userId: 'u1', loaded: true, profile: null };
    await render(<SessionEffects />);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('does not sign out on /welcome, on /sign-in/code, or while the viewer loads', async () => {
    mockViewer = { userId: 'u1', loaded: true, profile: null };
    for (const path of ['/welcome', '/sign-in/code']) {
      mockPathname = path;
      await render(<SessionEffects />);
    }
    mockPathname = '/agenda';
    mockViewer = { userId: 'u1', loaded: false, profile: null };
    await render(<SessionEffects />);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does nothing for a consented account', async () => {
    await render(<SessionEffects />);
    expect(signOut).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('switches the interface to the profile locale', async () => {
    mockViewer = { userId: 'u1', loaded: true, profile: { ...consented, locale: 'en-US' } };
    await render(<SessionEffects />);
    await act(async () => {});
    expect(i18n.language).toBe('en-US');
  });

  it('shows the expired-session toast once', async () => {
    (useAuthSession as jest.Mock).mockReturnValue({ status: 'signedOut', expired: true });
    mockViewer = { userId: null, loaded: true, profile: null };
    const view = await render(<SessionEffects />);
    await view.rerender(<SessionEffects />);
    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalledWith({ message: 'Sua sessão terminou. Entre de novo.' });
  });

  it('shows no toast for a signed-out visitor that did not expire', async () => {
    (useAuthSession as jest.Mock).mockReturnValue({ status: 'signedOut', expired: false });
    mockViewer = { userId: null, loaded: true, profile: null };
    await render(<SessionEffects />);
    expect(mockShow).not.toHaveBeenCalled();
  });
});
