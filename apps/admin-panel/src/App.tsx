import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Tenants } from './pages/Tenants';
import { Connectors } from './pages/Connectors';
import { Workflows } from './pages/Workflows';
import { Events } from './pages/Events';
import { Audit } from './pages/Audit';
import { Settings } from './pages/Settings';
import { Incidents } from './pages/Incidents';
import { IncidentDetail } from './pages/IncidentDetail';
import { SchemaDiffs } from './pages/SchemaDiffs';
import { MappingMemory } from './pages/MappingMemory';
import { Observability } from './pages/Observability';
import { ConsistencyRules } from './pages/ConsistencyRules';
import { Login } from './pages/Login';
import { useAuthStore } from './stores/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/tenants" element={<Tenants />} />
                    <Route path="/connectors" element={<Connectors />} />
                    <Route path="/workflows" element={<Workflows />} />
                    <Route path="/events" element={<Events />} />
                    <Route path="/audit" element={<Audit />} />
                    <Route path="/incidents" element={<Incidents />} />
                    <Route path="/incidents/:incidentId" element={<IncidentDetail />} />
                    <Route path="/schema-diffs" element={<SchemaDiffs />} />
                    <Route path="/mapping-memory" element={<MappingMemory />} />
                    <Route path="/observability" element={<Observability />} />
                    <Route path="/consistency-rules" element={<ConsistencyRules />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
