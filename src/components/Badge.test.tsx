import { render, screen } from '@testing-library/react-native';

import { Badge } from './Badge';

describe('Badge', () => {
  it('CA-07: renders nothing for 0', async () => {
    await render(<Badge count={0} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('CA-07: renders the number for 5', async () => {
    await render(<Badge count={5} />);
    expect(screen.getByText('5')).toBeOnTheScreen();
  });

  it('CA-07: renders 99+ above 99', async () => {
    await render(<Badge count={150} />);
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });
});
