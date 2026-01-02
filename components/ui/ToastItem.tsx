import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X, Copy } from 'lucide-react';
import { Button } from "@nextui-org/react";

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration: number;
}

interface ToastItemProps extends ToastMessage {
  onRemove: (id: string) => void;
}

export const ToastItem: React.FC<ToastItemProps> = ({ id, message, type, duration, onRemove }) => {
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(duration);

  // 样式配置
  const styles = {
    success: { bg: 'bg-success-50', border: 'border-success-200', text: 'text-success-700', icon: <CheckCircle size={18} className="text-success" /> },
    error: { bg: 'bg-danger-50', border: 'border-danger-200', text: 'text-danger-700', icon: <AlertCircle size={18} className="text-danger" /> },
    warning: { bg: 'bg-warning-50', border: 'border-warning-200', text: 'text-warning-700', icon: <AlertTriangle size={18} className="text-warning" /> },
    info: { bg: 'bg-primary-50', border: 'border-primary-200', text: 'text-primary-700', icon: <Info size={18} className="text-primary" /> },
  };

  const style = styles[type];

  const startTimer = () => {
    // 清除旧定时器
    if (timerRef.current) clearTimeout(timerRef.current);
    
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      handleClose();
    }, remainingTimeRef.current);
  };

  const pauseTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      // 计算剩余时间
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
    }
    setIsPaused(true);
  };

  const resumeTimer = () => {
    setIsPaused(false);
    // 恢复时，如果剩余时间太短，给用户一点缓冲时间 (例如最少 1.5秒)
    if (remainingTimeRef.current < 1500) {
        remainingTimeRef.current = 1500;
    }
    startTimer();
  };

  const handleClose = () => {
    setIsVisible(false);
    // 等待动画结束后移除
    setTimeout(() => onRemove(id), 300);
  };

  // 入场动画
  useEffect(() => {
    // 稍微延迟以触发 CSS transition
    requestAnimationFrame(() => setIsVisible(true));
    startTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 复制功能
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(message);
    // 可以加一个临时的 visual feedback，这里简化处理
  };

  return (
    <div
      className={`
        pointer-events-auto
        flex items-start gap-3 p-3 rounded-lg shadow-lg border backdrop-blur-sm transition-all duration-300 ease-in-out transform
        max-w-md w-fit min-w-[300px]
        ${style.bg} ${style.border}
        ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}
        ${isPaused ? 'ring-2 ring-offset-1 ring-default-300' : ''}
      `}
      // 核心交互逻辑：
      // 1. 点击 Toast 内部：阻止冒泡，防止触发全局的 "点击任意位置关闭"
      // 2. 点击：暂停计时
      onClick={(e) => {
        e.stopPropagation();
        pauseTimer();
      }}
      // 3. 鼠标移开：恢复计时
      onMouseLeave={() => {
        if (isPaused) resumeTimer();
      }}
    >
      <div className="shrink-0 mt-0.5">{style.icon}</div>
      
      <div className={`flex-1 text-sm font-medium ${style.text} break-words whitespace-pre-wrap leading-tight`}>
        {message}
      </div>

      <div className="flex flex-col gap-1 shrink-0 -mt-1 -mr-1">
        <Button 
            isIconOnly 
            size="sm" 
            variant="light" 
            className={`h-6 w-6 min-w-0 hover:bg-black/5 ${style.text}`} 
            onPress={handleClose}
        >
            <X size={14} />
        </Button>
        <Button
            isIconOnly
            size="sm"
            variant="light"
            className={`h-6 w-6 min-w-0 hover:bg-black/5 ${style.text}`}
            onPress={handleCopy}
            title="Copy message"
        >
            <Copy size={12} />
        </Button>
      </div>
    </div>
  );
};