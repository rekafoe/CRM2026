import React from 'react';
import './LoadingState.css';

interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  message = 'Загрузка...', 
  size = 'medium',
  fullScreen = false 
}) => {
  return (
    <div className={`loading-state ${fullScreen ? 'fullscreen' : ''} loading-${size}`}>
      <div className="loading-spinner"></div>
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
};

export default LoadingState;
