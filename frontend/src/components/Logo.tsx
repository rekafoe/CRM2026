import React from 'react';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ 
  size = 'medium', 
  showText = true, 
  className = '' 
}) => {
  const sizeClasses = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-lg'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex flex-col items-center">
        <div className={`font-bold text-gray-800 ${sizeClasses[size]}`}>
          PRINT
        </div>
        <div className={`font-bold text-gray-800 ${sizeClasses[size]}`} 
             style={{ 
               WebkitTextStroke: '1px #374151',
               WebkitTextFillColor: 'transparent',
               textStroke: '1px #374151',
               color: 'transparent'
             }}>
          CORE
        </div>
      </div>
      {showText && (
        <div className={`font-bold text-gray-800 ${sizeClasses[size]}`}>
          ПЕЧАТНЫЙ ЦЕНТР
        </div>
      )}
    </div>
  );
};
