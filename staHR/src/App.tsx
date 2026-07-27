import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import RecruitmentDashboard from './modules/recruitment/pages/RecruitmentDashboard'
import Candidates from './modules/recruitment/pages/Candidates'
import Upload from './modules/recruitment/pages/Upload'
import JobsPage from './modules/recruitment/pages/JobsPage'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './hooks/useAuth'

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="container"><div className="card">Loading...</div></div>
  if (!user) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/recruitment"
          element={
            <Protected>
              <Layout>
                <RecruitmentDashboard />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <Layout>
                <RecruitmentDashboard />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/candidates"
          element={
            <Protected>
              <Layout>
                <Candidates />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/recruitment/jobs"
          element={
            <Protected>
              <Layout>
                <JobsPage />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/upload"
          element={
            <Protected>
              <Layout>
                <Upload />
              </Layout>
            </Protected>
          }
        />
        <Route path="*" element={<div>404</div>} />
      </Routes>
    </AuthProvider>
  )
}
