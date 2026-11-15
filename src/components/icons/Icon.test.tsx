import { render } from '@testing-library/react-native';

import { glyphs, type IconName } from './glyphs';
import { Icon } from './Icon';

const requiredNames: IconName[] = [
  'calendar_month',
  'campaign',
  'account_tree',
  'edit_note',
  'assignment_ind',
  'login',
  'account_circle',
  'notifications',
  'notifications_active',
  'search',
  'cancel',
  'expand_more',
  'chevron_left',
  'chevron_right',
  'location_on',
  'add',
  'check',
  'check_circle',
  'close',
  'arrow_back',
  'arrow_forward',
  'push_pin',
  'tune',
  'lock',
  'badge',
  'groups',
  'event',
  'alarm',
  'notes',
  'draw',
  'delete',
  'format_bold',
  'format_italic',
  'format_list_bulleted',
  'checklist',
  'link',
  'calendar_today',
  'celebration',
  'forum',
  'school',
  'podium',
  'directions_bus',
  'apps',
  'call',
  'chat',
  'share',
  'map',
  'edit',
  'logout',
  'language',
  'download',
  'person',
  'image',
  'visibility',
];

type Node = { props?: { d?: string }; children?: Node[] | null };

function collectPaths(node: Node | Node[] | null): string[] {
  if (node === null) return [];
  if (Array.isArray(node)) return node.flatMap(collectPaths);
  return [...(node.props?.d ? [node.props.d] : []), ...collectPaths(node.children ?? null)];
}

describe('Icon', () => {
  it('CA-15: outlined and filled render different paths', async () => {
    const outlined = collectPaths((await render(<Icon name="calendar_month" />)).toJSON() as Node);
    const filled = collectPaths(
      (await render(<Icon name="calendar_month" filled />)).toJSON() as Node,
    );
    expect(outlined.length).toBeGreaterThan(0);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled).not.toEqual(outlined);
  });

  it('CA-15: unknown icon names do not type-check', () => {
    // Compile-time check: tsc (make lint) fails if the directive below becomes unused.
    // @ts-expect-error unknown icon name
    const element = <Icon name="not_an_icon" />;
    expect(element).toBeDefined();
  });

  it('CA-15: all 54 required names have outlined and filled glyphs', () => {
    expect(requiredNames).toHaveLength(54);
    for (const name of requiredNames) {
      expect(glyphs[name].outlined.length).toBeGreaterThan(0);
      expect(glyphs[name].filled.length).toBeGreaterThan(0);
    }
  });

  it('RNF-10: icons are hidden from the screen reader', async () => {
    const { toJSON } = await render(<Icon name="search" />);
    expect(JSON.stringify(toJSON())).toContain('no-hide-descendants');
  });
});
