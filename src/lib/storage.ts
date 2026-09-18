"use client";

import { Consultant } from "./types";

const KEY = "loog-studio.consultant.v1";

export function loadConsultant(): Partial<Consultant> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<Consultant>;
  } catch {
    return null;
  }
}

export function saveConsultant(c: Partial<Consultant>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // storage cheio ou bloqueado — silencioso
  }
}

export function clearConsultant(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
