import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** 밑줄 스타일 입력 — 포커스 시 잉크 블랙 밑줄. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, className = '', id, ...props }, ref) => (
    <label className="block" htmlFor={id}>
      {label && <span className="eyebrow mb-2 block">{label}</span>}
      <input
        ref={ref}
        id={id}
        className={`w-full border-0 border-b border-hairline bg-transparent py-2 text-base text-ink outline-none placeholder:text-gray focus:border-ink ${className}`}
        {...props}
      />
    </label>
  ),
);
TextField.displayName = 'TextField';
