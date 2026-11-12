import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves conflicting Tailwind utilities, last one wins. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
