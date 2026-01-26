import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'platform_admin' | 'tenant_admin' | 'operator' | 'viewer';
  tenantId?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        // In production, call the API
        // For demo, accept any credentials
        const mockUser: User = {
          id: 'usr_demo',
          email,
          name: email.split('@')[0],
          role: email.includes('admin') ? 'platform_admin' : 'tenant_admin',
          tenantId: email.includes('admin') ? undefined : 'ten_demo',
        };

        const mockToken = `demo_token_${Date.now()}`;

        set({
          user: mockUser,
          token: mockToken,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'integrax-auth',
    }
  )
);
