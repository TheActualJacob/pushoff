import { create } from 'zustand';

export const useGameStore = create((set) => ({
  phase: 'lobby',
  selfId: null,
  selfName: '',
  myReps: 0,
  peers: {},
  startTime: null,
  duration: 60_000,
  bodyAlignmentGate: true,

  setSelfName: (name) => set({ selfName: name }),
  setSelfId: (id) => set({ selfId: id }),
  setPhase: (phase) => set({ phase }),

  incrementRep: () => set((s) => ({ myReps: s.myReps + 1 })),
  resetReps: () => set({ myReps: 0 }),

  setDuration: (d) => set({ duration: d }),
  toggleAlignmentGate: () => set((s) => ({ bodyAlignmentGate: !s.bodyAlignmentGate })),

  addPeer: (peerId, info) =>
    set((s) => ({
      peers: {
        ...s.peers,
        [peerId]: { reps: 0, ready: false, connected: false, name: '', ...info },
      },
    })),

  updatePeer: (peerId, update) =>
    set((s) => ({
      peers: { ...s.peers, [peerId]: { ...s.peers[peerId], ...update } },
    })),

  removePeer: (peerId) =>
    set((s) => {
      const peers = { ...s.peers };
      delete peers[peerId];
      return { peers };
    }),

  setStartTime: (t) => set({ startTime: t }),
}));
