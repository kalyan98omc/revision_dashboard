import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from '../edtech-platform.jsx'

// Mock the fetch API so tests don't need a running backend
beforeEach(() => {
    global.fetch = vi.fn()
    localStorage.clear()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('App — unauthenticated', () => {
    it('shows the Login page when no token is stored', async () => {
        // No token in localStorage → authApi.me() won't be called
        render(<App />)
        // Spinner briefly shown then login page appears
        await waitFor(() => {
            expect(screen.getByText('Welcome back')).toBeInTheDocument()
        })
        expect(screen.getByPlaceholderText('you@email.com or username')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
    })

    it('can switch from Login to Signup page', async () => {
        render(<App />)
        await waitFor(() => screen.getByText('Welcome back'))
        fireEvent.click(screen.getByText('Create one'))
        expect(screen.getByText('Create account')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('alex_k')).toBeInTheDocument()
    })

    it('can switch back from Signup to Login', async () => {
        render(<App />)
        await waitFor(() => screen.getByText('Welcome back'))
        fireEvent.click(screen.getByText('Create one'))
        fireEvent.click(screen.getByText('Sign in'))
        expect(screen.getByText('Welcome back')).toBeInTheDocument()
    })

    it('shows error on failed login', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Invalid credentials' }),
        })
        render(<App />)
        await waitFor(() => screen.getByText('Welcome back'))
        fireEvent.change(screen.getByPlaceholderText('you@email.com or username'), { target: { value: 'wrong@user.com' } })
        fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrongpass' } })
        fireEvent.click(screen.getByText('Sign in →'))
        await waitFor(() => {
            expect(screen.getByText(/Invalid credentials/)).toBeInTheDocument()
        })
    })
})

describe('App — authenticated', () => {
    it('shows the dashboard when a valid token and user are in localStorage', async () => {
        localStorage.setItem('access_token', 'fake-token')
        // Mock /users/me returning a user
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                id: '123',
                display_name: 'Kalyanji Test',
                username: 'kalyanji',
                email: 'kalyanji@test.com',
                role: 'student',
                email_verified: true,
                created_at: '2024-01-01T00:00:00Z',
            }),
        })

        render(<App />)
        await waitFor(() => {
            expect(screen.getByText('Welcome back, Kalyanji 👋')).toBeInTheDocument()
        })
        expect(screen.getByPlaceholderText('Search topics, quizzes...')).toBeInTheDocument()
    })
})
