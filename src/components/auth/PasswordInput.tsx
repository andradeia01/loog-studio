"use client";

import { useState } from "react";

/**
 * Input de senha com toggle "olhinho" pra mostrar/ocultar.
 * Reutilizado em: /login, /signup, /recuperar-senha e SessionGuard modal.
 *
 * Toggle fica dentro do input (right-aligned) sem afetar o layout da label.
 * O `type` muda entre "password" e "text" preservando o valor digitado.
 */
export function PasswordInput({
  value,
  onChange,
  autoComplete = "current-password",
  minLength = 6,
  required = true,
  placeholder,
  autoFocus,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="input w-full pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-loog-muted transition hover:bg-loog-bg hover:text-white focus:outline-none focus:ring-1 focus:ring-loog-brand"
      >
        {visible ? (
          // olho aberto (visível) — vai esconder ao clicar
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          // olho fechado — vai mostrar ao clicar
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
