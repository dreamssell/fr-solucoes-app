import { create } from "zustand";

interface EditorStore {
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  dashboardTexts: Record<string, string>;
  setDashboardText: (key: string, value: string) => void;
  resetTexts: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  isEditing: false,
  setIsEditing: (isEditing: boolean) => set({ isEditing }),
  dashboardTexts: {},
  setDashboardText: (key: string, value: string) =>
    set((state: EditorStore) => ({
      dashboardTexts: { ...state.dashboardTexts, [key]: value },
    })),
  resetTexts: () => set({ dashboardTexts: {} }),
}));
