import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Select } from './Select';

function Harness() {
  const [v, setV] = useState('');
  return (
    <>
      <Select label="Level" value={v} onChange={setV} options={[{ value: 'b', label: 'Beginner' }, { value: 'i', label: 'Intermediate' }, { value: 'a', label: 'Advanced' }]} />
      <output>{v}</output>
    </>
  );
}

describe('Select', () => {
  it('is labelled and selects with the mouse', async () => {
    render(<Harness />);
    const combo = screen.getByRole('combobox', { name: 'Level' });
    await userEvent.click(combo);
    await userEvent.click(screen.getByRole('option', { name: 'Intermediate' }));
    expect(screen.getByText('i', { selector: 'output' })).toBeInTheDocument();
    expect(combo).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports keyboard navigation and Escape', async () => {
    render(<Harness />);
    const combo = screen.getByRole('combobox', { name: 'Level' });
    combo.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getByText('a', { selector: 'output' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
