import { create } from 'zustand'
import type { Engagement, Phase } from '@/types'

interface EngagementStore {
  activeEngagement: Engagement | null
  phases: Phase[]

  setActiveEngagement: (e: Engagement | null) => void
  setPhases: (phases: Phase[]) => void
  clearActive: () => void
}

export const useEngagementStore = create<EngagementStore>((set) => ({
  activeEngagement: null,
  phases: [],

  setActiveEngagement: (e) => set({ activeEngagement: e }),
  setPhases: (phases) => set({ phases }),
  clearActive: () => set({ activeEngagement: null, phases: [] }),
}))
