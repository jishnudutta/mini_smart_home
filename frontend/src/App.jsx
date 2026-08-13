import { useState } from 'react'
import { SmartRoomProvider } from './context/SmartRoomContext'
import Dashboard from './pages/Dashboard'
import Docs from './pages/Docs'

export default function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <SmartRoomProvider>
      {page === 'docs' ? (
        <Docs onBack={() => setPage('dashboard')} />
      ) : (
        <Dashboard onOpenDocs={() => setPage('docs')} />
      )}
    </SmartRoomProvider>
  )
}
