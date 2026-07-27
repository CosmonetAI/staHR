import React, { useRef } from 'react'

export default function FileUpload({ onFile }: { onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement | null>(null)

  return (
    <div>
      <div className="upload-area" onClick={() => ref.current?.click()}>
        <p>Drag & Drop or click to browse</p>
        <p>.xlsx .xls .csv supported</p>
        <input
          ref={ref}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && onFile(e.target.files[0])}
        />
      </div>
    </div>
  )
}
