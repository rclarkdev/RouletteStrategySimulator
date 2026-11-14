import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('foundation screen', () => {
  it('states that simulation functionality is not implemented', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Roulette Strategy Simulator' }),
    ).toBeVisible();
    expect(screen.getByText(/have not been implemented/i)).toBeVisible();
    expect(
      screen.getByText(/does not produce roulette outcomes/i),
    ).toBeVisible();
  });
});
