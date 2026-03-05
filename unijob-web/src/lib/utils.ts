import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency in VND
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Generate rating stars display
 */
export function getRatingStars(score: number): string {
  const fullStars = Math.floor(score);
  const halfStar = score % 1 >= 0.5 ? 1 : 0;
  const emptyStars = 5 - fullStars - halfStar;
  return '★'.repeat(fullStars) + (halfStar ? '☆' : '') + '☆'.repeat(emptyStars);
}

/**
 * Get max job limit based on rating score
 */
export function getMaxJobLimit(ratingScore: number): number {
  if (ratingScore >= 4.5) return 5;
  if (ratingScore >= 3.5) return 4;
  if (ratingScore >= 2.5) return 3;
  return 2; // Default for new users
}

/**
 * Validate HCMUT email
 */
export function isValidSchoolEmail(email: string): boolean {
  return email.endsWith('@hcmut.edu.vn');
}
