"use client";

import { createContext, useContext, type ButtonHTMLAttributes, type FormHTMLAttributes, type ReactNode } from "react";

const ReadOnlyContext = createContext(false);
const DirectorReaderContext = createContext(false);

export function ReadOnlyProvider({ readOnly, directorReadOnly = false, children }: { readOnly: boolean; directorReadOnly?: boolean; children: ReactNode }) {
  return <DirectorReaderContext.Provider value={directorReadOnly}><ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider></DirectorReaderContext.Provider>;
}

export function useDirectorReadOnly() { return useContext(DirectorReaderContext); }

export function useReadOnly() {
  return useContext(ReadOnlyContext);
}

export function ReadOnlyForm({ onSubmit, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  const readOnly = useReadOnly();
  return <form {...props} onSubmit={event => {
    if (readOnly) { event.preventDefault(); return; }
    onSubmit?.(event);
  }} />;
}

// Opt in only at persistence boundaries; navigation and local form exploration stay enabled.
export function WriteButton({ disabled, title, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const readOnly = useReadOnly();
  return <button {...props} disabled={readOnly || disabled}
    title={readOnly ? "Solo lectura" : title}
    className={`${className} disabled:cursor-not-allowed disabled:opacity-50`} />;
}
