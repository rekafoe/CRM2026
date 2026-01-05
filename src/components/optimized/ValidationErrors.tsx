import React from 'react';
import { ValidationError } from '../../utils/validation';

interface ValidationErrorsProps {
  errors: ValidationError[];
  field?: string;
  className?: string;
}

export const ValidationErrors: React.FC<ValidationErrorsProps> = ({ 
  errors, 
  field, 
  className = 'validation-errors' 
}) => {
  const filteredErrors = field 
    ? errors.filter(error => error.field === field)
    : errors;

  if (filteredErrors.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {filteredErrors.map((error, index) => (
        <div key={index} className="validation-error">
          {error.message}
        </div>
      ))}
    </div>
  );
};

// Компонент для отображения ошибки конкретного поля
export const FieldError: React.FC<{
  error: string | null;
  className?: string;
}> = ({ error, className = 'field-error' }) => {
  if (!error) return null;

  return (
    <div className={className}>
      {error}
    </div>
  );
};

// Компонент для отображения общих ошибок формы
export const FormErrors: React.FC<{
  errors: string[];
  className?: string;
}> = ({ errors, className = 'form-errors' }) => {
  if (errors.length === 0) return null;

  return (
    <div className={className}>
      <h4>Ошибки формы:</h4>
      <ul>
        {errors.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
    </div>
  );
};

