import { useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toasts]));
}

export function showToast(message: string, type: ToastType = 'info', duration: number = 3000) {
  const id = Math.random().toString(36).substring(7);
  const toast: Toast = { id, message, type, duration };
  
  toasts.push(toast);
  notifyListeners();
  
  if (duration > 0) {
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      notifyListeners();
    }, duration);
  }
  
  return id;
}

export function removeToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  notifyListeners();
}

export function useToast() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([]);
  
  useState(() => {
    const listener = (newToasts: Toast[]) => {
      setCurrentToasts(newToasts);
    };
    toastListeners.push(listener);
    setCurrentToasts([...toasts]);
    
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  });
  
  const show = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    return showToast(message, type, duration);
  }, []);
  
  const remove = useCallback((id: string) => {
    removeToast(id);
  }, []);
  
  return {
    toasts: currentToasts,
    show,
    remove,
    showSuccess: (message: string) => show(message, 'success'),
    showError: (message: string) => show(message, 'error', 5000),
    showInfo: (message: string) => show(message, 'info'),
    showWarning: (message: string) => show(message, 'warning'),
  };
}

