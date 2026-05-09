import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { TOTPSetupPage } from '@/pages/TOTPSetupPage'
import { TOTPVerifyPage } from '@/pages/TOTPVerifyPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { EngagementsPage } from '@/pages/EngagementsPage'
import { EngagementDetailPage } from '@/pages/EngagementDetailPage'
import { PreEngagementPage } from '@/pages/PreEngagementPage'
import { ReconPage } from '@/pages/ReconPage'
import { WeaponizationPage } from '@/pages/WeaponizationPage'
import { DeliveryPage } from '@/pages/DeliveryPage'
import { ExploitationPage } from '@/pages/ExploitationPage'
import { InstallationPage } from '@/pages/InstallationPage'
import { C2Page } from '@/pages/C2Page'
import { ObjectivesPage } from '@/pages/ObjectivesPage'
import { ExportPage } from '@/pages/ExportPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { AttackHeatmapPage } from '@/pages/AttackHeatmapPage'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function AppRoutes() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/totp/verify" element={<TOTPVerifyPage />} />
      <Route path="/auth/totp/setup" element={<TOTPSetupPage />} />

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/engagements" element={<EngagementsPage />} />
          <Route path="/engagements/new" element={<EngagementsPage />} />
          <Route path="/engagements/:id" element={<EngagementDetailPage />} />
          <Route path="/engagements/:id/phase/0" element={<PreEngagementPage />} />
          <Route path="/engagements/:id/phase/1" element={<ReconPage />} />
          <Route path="/engagements/:id/phase/2" element={<WeaponizationPage />} />
          <Route path="/engagements/:id/phase/3" element={<DeliveryPage />} />
          <Route path="/engagements/:id/phase/4" element={<ExploitationPage />} />
          <Route path="/engagements/:id/phase/5" element={<InstallationPage />} />
          <Route path="/engagements/:id/phase/6" element={<C2Page />} />
          <Route path="/engagements/:id/phase/7" element={<ObjectivesPage />} />
          <Route path="/engagements/:id/export" element={<ExportPage />} />
          <Route path="/engagements/:id/attack-coverage" element={<AttackHeatmapPage />} />
          <Route path="/engagements/:id/audit" element={<AuditLogPage />} />
          <Route path="/engagements/:id/phase/:phaseNumber" element={<EngagementDetailPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
