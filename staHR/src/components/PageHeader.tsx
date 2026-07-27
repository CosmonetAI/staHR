import React from 'react'

export default function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
          {subtitle && <div style={{ color: 'var(--ink-soft)' }}>{subtitle}</div>}
        </div>
        <div>{actions}</div>
      </div>
    </div>
  )
}
