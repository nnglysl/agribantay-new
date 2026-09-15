import { useContext } from 'react'
import FarmContext from '../context/FarmContext'

export function useSelectedFarm() {
  const ctx = useContext(FarmContext)
  if (!ctx) throw new Error('useSelectedFarm must be used within a FarmProvider')
  return ctx
}
