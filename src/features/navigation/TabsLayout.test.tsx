import '@/i18n';

import { userEvent } from '@testing-library/react-native';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Slot } from 'expo-router';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { ViewerKind } from '@/domain/permissions';
import {
  AgendaPlaceholder,
  BoardPlaceholder,
  CallingsPlaceholder,
  NotesPlaceholder,
  ProfilePlaceholder,
  SignInPlaceholder,
} from '@/features/placeholder/screens';

import { RootRedirect } from './RootRedirect';
import { TabsLayout } from './TabsLayout';
import { ViewerHeaderAvatar } from './ViewerHeaderAvatar';

type MockViewer = { kind: ViewerKind; profile: { displayName: string } | null };

const mockStore = {
  viewer: { kind: 'visitor', profile: null } as MockViewer,
  listeners: new Set<() => void>(),
};

function setViewer(viewer: MockViewer) {
  mockStore.viewer = viewer;
  mockStore.listeners.forEach((listener) => listener());
}

// useViewer subscribes to mockStore so a test can change the viewer and re-render the layout.
jest.mock('@/features/viewer/ViewerProvider', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  return {
    useViewer: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockStore.listeners.add(listener);
          return () => mockStore.listeners.delete(listener);
        },
        () => mockStore.viewer,
      ),
  };
});

function Shell() {
  return (
    <ToastProvider>
      <ViewerHeaderAvatar>
        <Slot />
      </ViewerHeaderAvatar>
    </ToastProvider>
  );
}

// The real Leadership screen has its own tests; this file only checks the tab bar.
const LeadershipRoute = () => null;

const routes = {
  _layout: Shell,
  index: RootRedirect,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/agenda': AgendaPlaceholder,
  '(tabs)/board': BoardPlaceholder,
  '(tabs)/leadership': LeadershipRoute,
  '(tabs)/notes': NotesPlaceholder,
  '(tabs)/callings': CallingsPlaceholder,
  '(tabs)/profile': ProfilePlaceholder,
  '(tabs)/sign-in': SignInPlaceholder,
};

function tabNames() {
  return screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel as string);
}

beforeEach(() => setViewer({ kind: 'visitor', profile: null }));

describe('tabs layout', () => {
  it.each([
    ['visitor', ['Agenda', 'Mural', 'Liderança', 'Entrar']],
    ['member', ['Agenda', 'Mural', 'Liderança', 'Anotações', 'Perfil']],
    ['leader', ['Agenda', 'Mural', 'Liderança', 'Anotações', 'Chamados']],
  ] as const)(
    'CA-16: %s sees the right tabs in order, with the current one selected',
    async (kind, labels) => {
      setViewer({ kind, profile: null });
      await renderRouter(routes, { initialUrl: '/agenda' });
      expect(tabNames()).toEqual(labels);
      expect(screen.getByRole('tab', { name: 'Agenda' })).toBeSelected();
      expect(screen.getByRole('tab', { name: 'Mural' })).not.toBeSelected();
    },
  );

  it('CA-16: pressing a tab navigates to it and selects it', async () => {
    const user = userEvent.setup();
    await renderRouter(routes, { initialUrl: '/agenda' });
    await user.press(screen.getByRole('tab', { name: 'Mural' }));
    expect(screen).toHavePathname('/board');
    expect(screen.getByRole('tab', { name: 'Mural' })).toBeSelected();
  });

  it('CA-17: a leader on Chamados goes to /agenda when the viewer becomes a member', async () => {
    setViewer({ kind: 'leader', profile: null });
    await renderRouter(routes, { initialUrl: '/callings' });
    expect(screen).toHavePathname('/callings');

    await act(async () => setViewer({ kind: 'member', profile: null }));
    await waitFor(() => expect(screen).toHavePathname('/agenda'));
  });

  it('CA-17: a leader can open /profile and stays there', async () => {
    setViewer({ kind: 'leader', profile: { displayName: 'Maria Souza' } });
    await renderRouter(routes, { initialUrl: '/agenda' });
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Abrir perfil' }));
    expect(screen).toHavePathname('/profile');
    expect(screen.getByRole('header', { name: 'Perfil' })).toBeOnTheScreen();
    expect(tabNames()).not.toContain('Perfil');
  });

  it.each([
    ['agenda', 'Agenda'],
    ['board', 'Mural'],
  ])('CA-18: the %s tab shows its title and the coming soon message', async (route, title) => {
    await renderRouter(routes, { initialUrl: `/${route}` });
    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByText('Esta área chega em breve.')).toBeOnTheScreen();
  });

  it.each([
    ['visitor', 'sign-in', 'Entrar'],
    ['member', 'notes', 'Anotações'],
    ['member', 'profile', 'Perfil'],
    ['leader', 'callings', 'Chamados'],
  ] as const)(
    'CA-18: %s sees %s with title and coming soon message',
    async (kind, route, title) => {
      setViewer({ kind, profile: null });
      await renderRouter(routes, { initialUrl: `/${route}` });
      expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
      expect(screen.getByText('Esta área chega em breve.')).toBeOnTheScreen();
    },
  );

  it('CA-18: / opens /agenda', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen).toHavePathname('/agenda');
  });

  it('CA-12: pressing the header avatar of a signed-in viewer goes to /profile', async () => {
    const user = userEvent.setup();
    setViewer({ kind: 'member', profile: { displayName: 'Maria Souza' } });
    await renderRouter(routes, { initialUrl: '/agenda' });
    expect(screen.getByText('MS', { includeHiddenElements: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Abrir perfil' }));
    expect(screen).toHavePathname('/profile');
  });

  it('CA-12: a visitor has no header avatar', async () => {
    await renderRouter(routes, { initialUrl: '/agenda' });
    expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();
  });
});
