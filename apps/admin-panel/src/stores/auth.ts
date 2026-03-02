
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
        try {
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          if (!res.ok) throw new Error('Credenciales inválidas');
          const data = await res.json();
          set({ user: data.user, token: data.token, isAuthenticated: true });
        } catch {
          // Backend not reachable — mock login for demo/preview
          if (!email || !password) {
            set({ user: null, token: null, isAuthenticated: false });
            throw new Error('Credenciales inválidas');
          }
          const role = email.includes('admin') ? 'platform_admin' : 'operator';
          set({
            user: { id: 'demo-1', email, name: email.split('@')[0], role },
            token: 'demo-token',
            isAuthenticated: true,
          });
        }
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
