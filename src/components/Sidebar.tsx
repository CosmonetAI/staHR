import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  const [recruitOpen, setRecruitOpen] = useState(true)
  const { user, isClient } = useAuth()
  const navClass = ({ isActive }: { isActive: boolean }) => `sidebar-link${isActive ? ' active' : ''}`

  return (
    <div className="sidebar">
      <div className="sidebar-brand-wrap">
        <div className="sidebar-brand">staHR</div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-group">
          <div className="sidebar-group-head" onClick={() => setRecruitOpen((s) => !s)}>
            <span>Recruitment</span>
            <span className={`sidebar-caret${recruitOpen ? ' open' : ''}`} aria-hidden="true" />
          </div>

          {recruitOpen && (
            <div className="sidebar-subnav">
              <NavLink className={navClass} to="/recruitment" end>Dashboard</NavLink>
              <NavLink className={navClass} to="/candidates">Candidates</NavLink>
              {/* hide Clients nav for client users */}
              {!isClient && <NavLink className={navClass} to="/recruitment/clients">Clients</NavLink>}
              <NavLink className={navClass} to="/recruitment/jobs">Jobs</NavLink>
            </div>
          )}
        </div>

        <div className="sidebar-link disabled" aria-disabled="true">
          <span>Reports</span>
          <span className="coming-soon">Coming soon</span>
        </div>
        <div className="sidebar-link disabled" aria-disabled="true">
          <span>Settings</span>
          <span className="coming-soon">Coming soon</span>
        </div>
      </nav>
    </div>
  )
}
