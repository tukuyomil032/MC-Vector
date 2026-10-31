import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Progress } from '@/renderer/components/ui/Progress';

// Arc moves the fill with a motion transform, which jsdom cannot measure. The progressbar's ARIA values
// are the contract these tests can check.
describe('Progress', () => {
  it('clamps values to the 0-100 range', () => {
    const { rerender } = render(<Progress value={-10} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');

    rerender(<Progress value={150} />);

    expect(progressbar).toHaveAttribute('aria-valuenow', '100');
    expect(progressbar).toHaveAttribute('aria-valuetext', '100%');
  });

  it('updates the reported value immediately to match the latest value', () => {
    const { rerender } = render(<Progress value={25} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '25');

    rerender(<Progress value={80} />);

    expect(progressbar).toHaveAttribute('aria-valuenow', '80');
    expect(progressbar).toHaveAttribute('aria-valuetext', '80%');
  });
});
