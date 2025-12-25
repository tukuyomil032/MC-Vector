import { useEffect, useState } from 'react';
import type { FC } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const bgColors: Record<ToastProps['type'], string> = {
  success: 'bg-gradient-to-br from-green-500 to-green-600',
  error: 'bg-gradient-to-br from-red-500 to-red-600',
  info: 'bg-gradient-to-br from-blue-500 to-blue-600'
};

const icons: Record<ToastProps['type'], string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ'
};

const Toast: FC<ToastProps> = ({ message, type, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-5 right-5 min-w-[300px] p-4 ${bgColors[type]} text-white rounded-lg shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)] flex items-center gap-3 z-99999 transition-all duration-300 ease-out font-sans font-medium ${visible ? 'translate-x-0 scale-100 opacity-100' : 'translate-x-full scale-90 opacity-0'}`}>
      <div className="bg-white/20 rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm">
        {icons[type]}
      </div>
      <div className="flex-1">{message}</div>
    </div>
  );
};

export default Toast;