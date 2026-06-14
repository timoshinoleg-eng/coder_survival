import { h, createContext } from "preact";
import { useContext } from "preact/hooks";

const OverlayContext = createContext(false);

export function OverlayProvider({ children, value = false }) {
  return h(OverlayContext.Provider, { value }, children);
}

export function useBlockingOverlay() {
  return useContext(OverlayContext);
}
