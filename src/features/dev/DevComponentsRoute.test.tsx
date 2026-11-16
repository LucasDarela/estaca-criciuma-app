import '@/i18n';

import { renderRouter, screen } from 'expo-router/testing-library';
import { Slot } from 'expo-router';

import { ToastProvider } from '@/components/toast/ToastProvider';
import { AgendaPlaceholder } from '@/features/placeholder/screens';

import { DevComponentsRoute } from './DevComponentsRoute';

function Shell() {
  return (
    <ToastProvider>
      <Slot />
    </ToastProvider>
  );
}

const routes = {
  _layout: Shell,
  '(tabs)/agenda': AgendaPlaceholder,
  'dev/components': DevComponentsRoute,
};

const sections = [
  'Botão',
  'Campo de texto',
  'Campo de busca',
  'Chip de filtro',
  'Seletor de público',
  'Etiqueta de unidade',
  'Etiqueta de status',
  'Contador',
  'Controle segmentado',
  'Cartão de evento',
  'Item de lista',
  'Avatar',
  'Interruptor',
  'Aviso rápido',
  'Barra de abas',
  'Cabeçalho de tela',
  'Painel inferior',
  'Estado vazio',
  'Faixa sem conexão',
  'Carregando',
  'Ícones',
];

const originalDev = __DEV__;
const setDev = (value: boolean) => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
};
afterEach(() => {
  setDev(originalDev);
});

describe('/dev/components', () => {
  it('CA-19: outside development it redirects to /agenda', async () => {
    setDev(false);
    await renderRouter(routes, { initialUrl: '/dev/components' });
    expect(screen).toHavePathname('/agenda');
  });

  it('CA-19: in development it shows the catalog with every component section', async () => {
    setDev(true);
    await renderRouter(routes, { initialUrl: '/dev/components' });
    expect(screen).toHavePathname('/dev/components');
    expect(screen.getByRole('header', { name: 'Catálogo de componentes' })).toBeOnTheScreen();
    for (const title of sections) {
      expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    }
  });

  it('CA-19: the catalog lists all 54 icons', async () => {
    setDev(true);
    await renderRouter(routes, { initialUrl: '/dev/components' });
    expect(screen.getByText('calendar_month')).toBeOnTheScreen();
    expect(screen.getByText('visibility')).toBeOnTheScreen();
  });
});
