import { createContext, useContext } from "react";

interface HoverModelCtx {
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}

export const HoverModelContext = createContext<HoverModelCtx>({
  hoveredId: null,
  setHoveredId: () => {},
});

export function useHoverModel() {
  return useContext(HoverModelContext);
}
