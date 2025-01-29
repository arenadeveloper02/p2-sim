import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getTimestamp = () => {
  if (typeof window === 'undefined') {
    return Date.now()
  }
  return window.INITIAL_TIMESTAMP || Date.now()
}
