import React from 'react';

export type OrderStatus = string;

interface StatusStep {
  id: number;
  name: string;
  color?: string;
  sort_order: number;
}

interface ProgressBarProps {
  current: number;
  statuses: StatusStep[];
  onStatusChange?: (statusId: number) => void;
  width?: string;
  height?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  statuses,
  onStatusChange,
  width = '100%',
  height = '12px',
}) => {
  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const currentStep = sortedStatuses.find(s => s.id === current);
  const currentIndex = sortedStatuses.findIndex(s => s.id === current);
  const percent = currentIndex >= 0 ? ((currentIndex + 1) / sortedStatuses.length) * 100 : 0;

  const getStatusColor = (statusId: number) => {
    const status = sortedStatuses.find(s => s.id === statusId);
    return status?.color || '#e0e0e0';
  };

  const handleStatusClick = (statusId: number) => {
    if (onStatusChange) {
      onStatusChange(statusId);
    }
  };

  return (
    <div className="progress-bar-container" style={{ width }}>
      {/* Progress bar */}
      <div
        className="progress-bar"
        style={{ 
          backgroundColor: '#e0e0e0', 
          height, 
          borderRadius: height,
          position: 'relative',
          marginBottom: '8px'
        }}
      >
        <div
          className="progress-bar__fill"
          style={{
            width: `${percent}%`,
            backgroundColor: currentStep?.color || '#4caf50',
            height,
            borderRadius: height,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Status numbers and labels */}
      <div className="progress-bar__steps" style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
        {sortedStatuses.map((status, index) => {
          const isActive = status.id === current;
          const isCompleted = currentIndex > index;
          const statusColor = getStatusColor(status.id);
          
          return (
            <div
              key={status.id}
              className="progress-bar__step"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: onStatusChange ? 'pointer' : 'default',
                flex: 1,
                position: 'relative'
              }}
              onClick={() => handleStatusClick(status.id)}
            >
              {/* Status number circle */}
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: isActive || isCompleted ? statusColor : '#e0e0e0',
                  color: isActive || isCompleted ? 'white' : '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  marginBottom: '4px',
                  transition: 'all 0.3s ease',
                  border: isActive ? `2px solid ${statusColor}` : '2px solid transparent'
                }}
              >
                {index + 1}
              </div>
              
              {/* Status label */}
              <div
                style={{
                  fontSize: '10px',
                  textAlign: 'center',
                  color: isActive ? statusColor : '#666',
                  fontWeight: isActive ? 'bold' : 'normal',
                  maxWidth: '60px',
                  lineHeight: '1.2'
                }}
              >
                {status.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
