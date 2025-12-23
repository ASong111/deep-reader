// 错误处理工具
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// 全局错误处理
export function handleError(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  
  if (error instanceof Error) {
    console.error('Error:', error);
    return error.message || '发生未知错误';
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return '发生未知错误';
}

// 网络错误检测
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('网络') || 
           error.message.includes('Network') ||
           error.message.includes('fetch') ||
           error.message.includes('timeout');
  }
  return false;
}

// 离线检测
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true; // 默认假设在线
}

// 重试函数
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

