import React from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

export default function Layout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Navbar />
        {children}
      </div>
    </div>
  )
}
