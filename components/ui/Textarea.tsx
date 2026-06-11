import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

/** 밑줄 스타일 여러 줄 입력. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className = '', id, ...props }, ref) => (
    <label className="block" htmlFor={id}>
      {label && <span className="eyebrow mb-2 block">{label}</span>}
      <textarea
        ref={ref}
        id={id}
        className={`w-full resize-none border-0 border-b border-hairline bg-transparent py-2 text-base text-ink outline-none placeholder:text-gray focus:border-ink ${className}`}
        rows={8}
        {...props}
      />
    </label>
  ),
);
Textarea.displayName = 'Textarea';
