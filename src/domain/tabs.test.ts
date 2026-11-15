import { allTabRoutes, tabsFor } from './tabs';

const routes = (kind: Parameters<typeof tabsFor>[0]) => tabsFor(kind).map((tab) => tab.route);

describe('tabsFor', () => {
  it('CA-16: visitor gets Agenda, Mural, Liderança and Entrar', () => {
    expect(routes('visitor')).toEqual(['agenda', 'board', 'leadership', 'sign-in']);
  });

  it('CA-16: member gets Agenda, Mural, Liderança, Anotações and Perfil', () => {
    expect(routes('member')).toEqual(['agenda', 'board', 'leadership', 'notes', 'profile']);
  });

  it('CA-16: leader gets Agenda, Mural, Liderança, Anotações and Chamados', () => {
    expect(routes('leader')).toEqual(['agenda', 'board', 'leadership', 'notes', 'callings']);
  });

  it('CA-16: icons and label keys follow the design', () => {
    expect(tabsFor('leader').map((tab) => [tab.icon, tab.labelKey])).toEqual([
      ['calendar_month', 'tabs.agenda'],
      ['campaign', 'tabs.board'],
      ['account_tree', 'tabs.leadership'],
      ['edit_note', 'tabs.notes'],
      ['assignment_ind', 'tabs.callings'],
    ]);
    expect(tabsFor('visitor')[3]).toEqual({
      route: 'sign-in',
      icon: 'login',
      labelKey: 'tabs.signIn',
    });
  });

  it('never has more than 5 tabs and only known routes', () => {
    for (const kind of ['visitor', 'member', 'leader'] as const) {
      expect(tabsFor(kind).length).toBeLessThanOrEqual(5);
      for (const route of routes(kind)) expect(allTabRoutes).toContain(route);
    }
  });
});
