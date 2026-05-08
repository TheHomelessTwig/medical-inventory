import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../components/Modal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  title: 'Test Modal',
  children: <p>Modal content here</p>,
};

describe('Modal component', () => {
  it('renders when isOpen=true', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content here')).toBeInTheDocument();
  });

  it('does NOT render when isOpen=false', () => {
    render(<Modal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '' })); // X button (no text)
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal {...defaultProps} onClose={onClose} />);
    // The backdrop is the absolute-positioned div behind the modal
    const backdrop = container.querySelector('.absolute.inset-0');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders footer when provided', () => {
    render(
      <Modal {...defaultProps} footer={<button>Save</button>}>
        <p>body</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does NOT render footer section when footer is omitted', () => {
    const { container } = render(<Modal {...defaultProps} />);
    // Footer has a specific bg-slate-50 rounded-b-xl class
    expect(container.querySelector('.bg-slate-50.rounded-b-xl')).toBeNull();
  });

  it('applies size class for each size variant', () => {
    const sizes = ['sm', 'md', 'lg', 'xl', '2xl'] as const;
    const sizeClasses = {
      sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg',
      xl: 'max-w-xl', '2xl': 'max-w-2xl',
    };
    for (const size of sizes) {
      const { container } = render(<Modal {...defaultProps} size={size} />);
      const dialog = container.querySelector(`.${sizeClasses[size]}`);
      expect(dialog).not.toBeNull();
    }
  });
});
