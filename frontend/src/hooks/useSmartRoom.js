import { useContext } from 'react'
import { SmartRoomContext } from '../context/SmartRoomContext'

export function useSmartRoom() {
  const ctx = useContext(SmartRoomContext)
  if (!ctx) throw new Error('useSmartRoom must be used inside <SmartRoomProvider>')
  return ctx
}
