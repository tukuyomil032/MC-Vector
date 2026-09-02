import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Progress } from '@/renderer/components/ui/Progress';

describe('Progress', () => {
  it('clamps values to the 0-100 range', () => {
    const { rerender } = render(<Progress value={-10} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar.firstElementChild).toHaveStyle({ width: '0%' });

    rerender(<Progress value={150} />);

    expect(progressbar).toHaveAttribute('aria-valuenow', '100');
    expect(progressbar.firstElementChild).toHaveStyle({ width: '100%' });
  });

  it('updates the indicator width immediately to match the latest value', () => {
    const { rerender } = render(<Progress value={25} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.firstElementChild).toHaveStyle({ width: '25%' });

    rerender(<Progress value={80} />);

    expect(progressbar.firstElementChild).toHaveStyle({ width: '80%' });
    expect(progressbar.firstElementChild).not.toHaveStyle({
      transform: 'translateX(-20%)',
    });
  });
});
