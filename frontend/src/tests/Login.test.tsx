import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock AuthContext so Login can render
const mockLogin = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: mockLogin,
  }),
}));

import Login from '../pages/Login';

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Login page', () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  it('renders email and password fields', () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/you@clinic.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('renders Sign in button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows validation error if email is empty on submit', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for invalid email format', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/you@clinic.com/i), 'not-an-email');
    // jsdom doesn't enforce HTML5 email constraint validation, so submit via
    // fireEvent.submit to let React Hook Form run its own pattern check.
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => {
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
    });
  });

  it('shows validation error if password is empty on submit', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByPlaceholderText(/you@clinic.com/i), 'test@clinic.local');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('calls login() with correct credentials on valid submit', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/you@clinic.com/i), 'admin@clinic.local');
    await user.type(screen.getByPlaceholderText('••••••••'), 'Admin123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@clinic.local', 'Admin123!');
    });
  });

  it('shows server error message on failed login', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/you@clinic.com/i), 'wrong@clinic.local');
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it('toggles password visibility when eye icon is clicked', async () => {
    const user = userEvent.setup();
    renderLogin();

    const pwdField = screen.getByPlaceholderText('••••••••');
    expect(pwdField).toHaveAttribute('type', 'password');

    // Click the show/hide button (it's next to the password input)
    const toggleBtn = pwdField.closest('div')!.querySelector('button')!;
    await user.click(toggleBtn);
    expect(pwdField).toHaveAttribute('type', 'text');

    await user.click(toggleBtn);
    expect(pwdField).toHaveAttribute('type', 'password');
  });

  it('shows demo account credentials in the footer', () => {
    renderLogin();
    expect(screen.getByText(/admin@clinic.local/i)).toBeInTheDocument();
    expect(screen.getByText(/doctor@clinic.local/i)).toBeInTheDocument();
    expect(screen.getByText(/nurse@clinic.local/i)).toBeInTheDocument();
  });

  it('disables the submit button while login is in progress', async () => {
    // Make login take a moment
    mockLogin.mockImplementation(() => new Promise(r => setTimeout(r, 500)));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/you@clinic.com/i), 'admin@clinic.local');
    await user.type(screen.getByPlaceholderText('••••••••'), 'Admin123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
  });
});
