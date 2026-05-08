import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge, { statusColors, priorityColors } from '../components/Badge';

describe('Badge component', () => {
  it('renders children text', () => {
    render(<Badge>pending</Badge>);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('applies default slate colour class when no color prop', () => {
    const { container } = render(<Badge>test</Badge>);
    expect(container.firstChild).toHaveClass('bg-slate-100', 'text-slate-700');
  });

  it('applies the correct class for each color', () => {
    const cases: Array<[Parameters<typeof Badge>[0]['color'], string]> = [
      ['blue', 'bg-blue-100'],
      ['green', 'bg-green-100'],
      ['red', 'bg-red-100'],
      ['emerald', 'bg-emerald-100'],
      ['yellow', 'bg-yellow-100'],
      ['orange', 'bg-orange-100'],
      ['purple', 'bg-purple-100'],
      ['cyan', 'bg-cyan-100'],
    ];

    for (const [color, expected] of cases) {
      const { container } = render(<Badge color={color}>x</Badge>);
      expect(container.firstChild).toHaveClass(expected);
    }
  });

  it('accepts and applies custom className', () => {
    const { container } = render(<Badge className="ml-2">tag</Badge>);
    expect(container.firstChild).toHaveClass('ml-2');
  });

  it('statusColors maps all known statuses to valid colors', () => {
    const statuses = ['pending', 'accepted', 'fulfilled', 'cancelled', 'received', 'posted', 'completed'];
    for (const s of statuses) {
      expect(statusColors[s]).toBeDefined();
    }
  });

  it('priorityColors maps all known priorities to valid colors', () => {
    const priorities = ['low', 'normal', 'high', 'urgent'];
    for (const p of priorities) {
      expect(priorityColors[p]).toBeDefined();
    }
  });
});
