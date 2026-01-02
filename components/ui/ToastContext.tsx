import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { ToastItem, ToastMessage } from './ToastItem';
import { createPortal } from 'react-dom';

interface ToastContextType {
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    warning: (msg: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    // 简单的时长算法：基础 3s，每增加 10 个字符加 1s，上限 10s
    const length = message.length;
    const computedDuration = Math.min(10000, Math.max(3000, 3000 + (length / 10) * 1000));

    setToasts((prev) => [...prev, { id, message, type, duration: computedDuration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 快捷方法
  const toast = {
    success: (msg: string) => addToast(msg, 'success'),
    error: (msg: string) => addToast(msg, 'error'),
    info: (msg: string) => addToast(msg, 'info'),
    warning: (msg: string) => addToast(msg, 'warning'),
  };

  // 全局点击监听：点击屏幕任意位置（除了Toast本身），清除所有 Toast
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // 如果点击的目标不在 toast 容器内，则清除所有未被"锁定"（例如正在交互）的 toast
      // 由于 ToastItem 内部会阻止冒泡，所以能冒泡到这里的 click 事件，一定是在 Toast 外部触发的
      if (toasts.length > 0) {
        setToasts([]);
      }
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, toast }}>
      {children}
      {createPortal(
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[9999] flex flex-col-reverse gap-2 pointer-events-none items-center">
          {toasts.map((t) => (
            <ToastItem key={t.id} {...t} onRemove={removeToast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
};
