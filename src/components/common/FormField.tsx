import React from 'react';
import '../../styles/utilities.css';

interface FormFieldProps {
  label?: string;
  error?: string;
  help?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ 
  label, 
  error, 
  help, 
  required = false,
  children, 
  className = '' 
}) => {
  return (
    <div className={`form-group ${className}`}>
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      {children}
      {error && (
        <div className="text-error text-sm mt-1">
          {error}
        </div>
      )}
      {help && !error && (
        <div className="text-muted text-sm mt-1">
          {help}
        </div>
      )}
    </div>
  );
};
