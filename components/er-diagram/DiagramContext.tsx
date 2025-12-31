import React from 'react';

// --- Context for Managing Active Popover State ---
export type DiagramContextType = {
  activeEntityIds: string[];
  addActiveEntity: (id: string) => void;
  removeActiveEntity: (id: string) => void;
  switchActiveEntity: (fromId: string, toId: string) => void;
};
export const DiagramContext = React.createContext<DiagramContextType>({ 
    activeEntityIds: [], 
    addActiveEntity: () => {}, 
    removeActiveEntity: () => {},
    switchActiveEntity: () => {}
});
