import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/test/setup';
import { ApiError } from '@/lib/api';
import { LoginForm } from './LoginForm';

const post = vi.fn();
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), post: (...a: unknown[]) => post(...a) }));

const renderForm = () => render(<QueryClientProvider client={new QueryClient()}><LoginForm /></QueryClientProvider>);

describe('LoginForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates input before calling the API', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('signs in and routes learners to their dashboard', async () => {
    post.mockResolvedValue({ id: '1', permissions: ['courses.learn'], roles: ['LEARNER'] });
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.test');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.test', password: 'secret-123' });
    expect(router.push).toHaveBeenCalledWith('/learn');
  });

  it('shows the server error message', async () => {
    post.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect'));
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.test');
    await userEvent.type(screen.getByLabelText('Password'), 'nope-12345');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect')).toBeInTheDocument();
  });
});
