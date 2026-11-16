import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { TextField } from './TextField';

const base = { label: 'E-mail', value: '', onChangeText: jest.fn() };

describe('TextField', () => {
  let announce: jest.SpyInstance;
  beforeEach(() => {
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    announce.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('CA-03: shows the error below the field and exposes it to the screen reader', async () => {
    await render(<TextField {...base} error="Informe seu e-mail." />);
    expect(screen.getByText('Informe seu e-mail.')).toBeOnTheScreen();
    expect(screen.getByLabelText('E-mail').props.accessibilityHint).toBe('Informe seu e-mail.');
  });

  it('CA-03: announces the error when it appears, once', async () => {
    await render(<TextField {...base} />);
    expect(announce).not.toHaveBeenCalled();

    await screen.rerender(<TextField {...base} error="Informe seu e-mail." />);
    await screen.rerender(<TextField {...base} value="a" error="Informe seu e-mail." />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Informe seu e-mail.');
  });

  it('uses the hint as accessibility hint when there is no error', async () => {
    await render(<TextField {...base} hint="Usado para entrar." />);
    expect(screen.getByText('Usado para entrar.')).toBeOnTheScreen();
    expect(screen.getByLabelText('E-mail').props.accessibilityHint).toBe('Usado para entrar.');
  });

  it('reports typed text through onChangeText', async () => {
    const onChangeText = jest.fn();
    await render(<TextField {...base} onChangeText={onChangeText} />);
    await act(async () => {
      screen.getByLabelText('E-mail').props.onChangeText('maria@exemplo.com');
    });
    expect(onChangeText).toHaveBeenCalledWith('maria@exemplo.com');
  });

  it('[leadership] shows the placeholder when the field is empty', async () => {
    await render(<TextField {...base} label="Telefone" placeholder="(48) 99999-0000" />);
    expect(screen.getByPlaceholderText('(48) 99999-0000')).toBeOnTheScreen();
  });
});
