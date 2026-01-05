import React from 'react';
import './ErrorState.css';

interface ErrorStateProps {
  message: string;
  title?: string;
  onRetry?: () => void;
  fullScreen?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ 
  message, 
  title = 'Произошла ошибка',
  onRetry,
  fullScreen = false 
}) => {
  return (
    <div className={`error-state ${fullScreen ? 'fullscreen' : ''}`}>
      <div className="error-content">
        <div className="error-icon">❌</div>
        <h3 className="error-title">{title}</h3>
        <p className="error-message">{message}</p>
        {onRetry && (
          <button className="retry-button" onClick={onRetry}>
            🔄 Попробовать снова
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorState;
