
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchAdminJson } from '../lib/adminApi';
import { allowDemoFallbacks, appEnv } from '../lib/runtime';

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
          const data = await fetchAdminJson<{ user: User; token: string }>('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          set({ user: data.user, token: data.token, isAuthenticated: true });
        } catch {
          if (!email || !password) {
            set({ user: null, token: null, isAuthenticated: false });
            throw new Error('Credenciales inválidas');
          }

          if (!allowDemoFallbacks) {
            set({ user: null, token: null, isAuthenticated: false });
            throw new Error('Servicio de autenticación no disponible');
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
      name: `integrax-auth-${appEnv}`,
    }
  )
);
