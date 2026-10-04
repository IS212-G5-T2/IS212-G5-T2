import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useRef, useState } from "react";
import clsx from "clsx";

interface FieldWrapperProps {
  label: ReactNode;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  labelAccessory?: ReactNode;
  children: ReactNode;
}

function FieldWrapper({ label, htmlFor, required, error, hint, labelAccessory, children }: FieldWrapperProps) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-danger-600 dark:text-danger-400"> *</span>}
        {labelAccessory}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger-600 dark:text-danger-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  labelAccessory?: ReactNode;
}

export function TextInput({ label, error, hint, labelAccessory, id, className, ...rest }: TextInputProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <FieldWrapper
      label={label}
      htmlFor={fieldId}
      required={rest.required}
      error={error}
      hint={hint}
      labelAccessory={labelAccessory}
    >
      <input
        id={fieldId}
        className={clsx(
          "w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500",
          error ? "border-danger-400 dark:border-danger-600" : "border-gray-300 dark:border-gray-600",
          className
        )}
        aria-invalid={!!error}
        {...rest}
      />
    </FieldWrapper>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextArea({ label, error, hint, id, className, ...rest }: TextAreaProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={rest.required} error={error} hint={hint}>
      <textarea
        id={fieldId}
        rows={4}
        className={clsx(
          "w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500",
          error ? "border-danger-400 dark:border-danger-600" : "border-gray-300 dark:border-gray-600",
          className
        )}
        aria-invalid={!!error}
        {...rest}
      />
    </FieldWrapper>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  error?: string;
  hint?: string;
}

export function Select({ label, options, error, hint, id, className, ...rest }: SelectProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={rest.required} error={error} hint={hint}>
      <select
        id={fieldId}
        className={clsx(
          "w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary-500 focus:ring-1 focus:ring-primary-500",
          error ? "border-danger-400 dark:border-danger-600" : "border-gray-300 dark:border-gray-600",
          className
        )}
        aria-invalid={!!error}
        {...rest}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

interface RadioGroupProps {
  label: string;
  name: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

export function RadioGroup({ label, name, options, value, onChange }: RadioGroupProps) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</legend>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50 dark:has-[:checked]:bg-primary-900/30"
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={(e) => onChange(e.target.value)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface ComboBoxProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  id?: string;
  placeholder?: string;
}

/**
 * Themed combobox: a styled dropdown of existing options that also accepts a
 * freely typed new value. On focus it shows all options; typing filters them.
 */
export function ComboBox({ label, options, value, onChange, error, hint, required, id, placeholder }: ComboBoxProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const listId = `${fieldId}-listbox`;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when the user clicks outside the field.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter((option) => option.toLowerCase().includes(query)) : options;

  function select(option: string) {
    onChange(option);
    setOpen(false);
  }

  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={required} error={error} hint={hint}>
      <div ref={containerRef} className="relative">
        <input
          id={fieldId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className={clsx(
            "w-full rounded-lg border px-3 py-2 pr-9 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500",
            error ? "border-danger-400 dark:border-danger-600" : "border-gray-300 dark:border-gray-600"
          )}
          aria-invalid={!!error}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle dropdown"
          onClick={() => setOpen((previous) => !previous)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 dark:text-gray-500"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
          </svg>
        </button>
        {open && filtered.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg"
          >
            {filtered.map((option) => (
              <li
                key={option}
                role="option"
                aria-selected={option === value}
                onMouseDown={(event) => {
                  // Prevent input blur so the selection registers before the panel closes.
                  event.preventDefault();
                  select(option);
                }}
                className={clsx(
                  "cursor-pointer px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700",
                  option === value && "bg-gray-100 dark:bg-gray-700"
                )}
              >
                {option}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
}

export function CheckboxGroup({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (option: string) => {
    onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option]);
  };
  return (
    <fieldset className="mb-4">
      {label && <legend className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</legend>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isChecked = values.includes(opt);
          return (
            <label
              key={opt}
              className={clsx(
                "flex cursor-pointer items-center gap-2 rounded-full border-2 px-3.5 py-2 text-sm font-medium transition-all",
                isChecked
                  ? "border-primary-500 bg-blue-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-200"
                  : "border-gray-300 text-gray-700 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500"
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(opt)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500"
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
