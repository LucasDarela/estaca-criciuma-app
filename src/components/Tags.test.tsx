import { render, screen } from '@testing-library/react-native';

import { theme, units } from '@/theme/theme';

import { StatusTag } from './StatusTag';
import { UnitTag } from './UnitTag';

describe('tags', () => {
  it('CA-06: UnitTag shows the unit label with its tint and text colors', async () => {
    await render(<UnitTag unitId="icara" />);
    const label = screen.getByText('Içara');
    expect(label).toHaveStyle({ color: units.icara.text });
    expect(label.parent).toHaveStyle({ backgroundColor: units.icara.tint });
  });

  it('CA-06: StatusTag uses the warning tone colors', async () => {
    await render(<StatusTag tone="warning" label="Pendente" />);
    const label = screen.getByText('Pendente');
    expect(label).toHaveStyle({ color: theme.warningText });
    expect(label.parent).toHaveStyle({ backgroundColor: theme.warningSubtle });
  });
});
