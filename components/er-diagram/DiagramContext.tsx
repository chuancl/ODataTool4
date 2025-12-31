import React from 'react';

// --- Context for Managing Active Popover State ---
export type DiagramContextType = {
  activeEntityId: string | null;
  setActiveEntityId: (id: string | null) => void;
};
export const DiagramContext = React.createContext<DiagramContextType>({ activeEntityId: null, setActiveEntityId: () => {} });
