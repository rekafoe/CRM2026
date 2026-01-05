import React from 'react';

interface WarehouseFormFieldProps {
  label: string;
  id: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url';
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  error?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  as?: 'input' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
  rows?: number;
}

export const WarehouseFormField: React.FC<WarehouseFormFieldProps> = ({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  helpText,
  required = false,
  disabled = false,
  min,
  max,
  step,
  as = 'input',
  options,
  rows,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const newValue = type === 'number' ? Number(e.target.value) : e.target.value;
    onChange(newValue);
  };

  const renderInput = () => {
    if (as === 'select' && options) {
      return (
        <select
          id={id}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className="form-select"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (as === 'textarea') {
      return (
        <textarea
          id={id}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows || 3}
          className="form-textarea"
        />
      );
    }

    return (
      <input
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className="form-input"
      />
    );
  };

  return (
    <div className="form-group warehouse-form-field">
      <label htmlFor={id} className="form-label">
        {label}
        {required && <span className="text-error ml-1">*</span>}
      </label>
      {renderInput()}
      {error && (
        <div className="text-error text-sm mt-1">
          {error}
        </div>
      )}
      {helpText && !error && (
        <div className="text-muted text-sm mt-1">
          {helpText}
        </div>
      )}
    </div>
  );
};
