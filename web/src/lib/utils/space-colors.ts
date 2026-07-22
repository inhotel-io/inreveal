import { UserAvatarColor } from '@immich/sdk';

/**
 * Tailwind classes for a shared space's accent colour.
 *
 * Every value is a full literal class name so Tailwind 4's source scanner can discover it —
 * never build these by interpolating a shade.
 */
export interface SpaceAccentClasses {
  /** Solid fill from the @immich/ui primary ramp (its `primary` shade is mode-aware). */
  bg: string;
  border: string;
  text: string;
  /** Solid fill from the legacy `--immich-primary` token (its `primary` shade is mode-agnostic). */
  solidBg: string;
}

export const spaceAccentClasses: Record<string, SpaceAccentClasses> = {
  primary: { bg: 'bg-primary', border: 'border-primary', text: 'text-primary', solidBg: 'bg-immich-primary' },
  pink: { bg: 'bg-pink-400', border: 'border-pink-400', text: 'text-pink-400', solidBg: 'bg-pink-400' },
  red: { bg: 'bg-red-500', border: 'border-red-500', text: 'text-red-500', solidBg: 'bg-red-500' },
  yellow: { bg: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', solidBg: 'bg-yellow-500' },
  blue: { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-500', solidBg: 'bg-blue-500' },
  green: { bg: 'bg-green-600', border: 'border-green-600', text: 'text-green-600', solidBg: 'bg-green-600' },
  purple: { bg: 'bg-purple-600', border: 'border-purple-600', text: 'text-purple-600', solidBg: 'bg-purple-600' },
  orange: { bg: 'bg-orange-600', border: 'border-orange-600', text: 'text-orange-600', solidBg: 'bg-orange-600' },
  gray: { bg: 'bg-gray-600', border: 'border-gray-600', text: 'text-gray-600', solidBg: 'bg-gray-600' },
  amber: { bg: 'bg-amber-600', border: 'border-amber-600', text: 'text-amber-600', solidBg: 'bg-amber-600' },
};

export const spaceGradientClasses: Record<string, string> = {
  primary: 'from-immich-primary/60 to-immich-primary',
  pink: 'from-pink-300 to-pink-500',
  red: 'from-red-400 to-red-600',
  yellow: 'from-yellow-300 to-yellow-500',
  blue: 'from-blue-400 to-blue-600',
  green: 'from-green-400 to-green-700',
  purple: 'from-purple-400 to-purple-700',
  orange: 'from-orange-400 to-orange-600',
  gray: 'from-gray-400 to-gray-600',
  amber: 'from-amber-400 to-amber-600',
};

export type SpaceColor = UserAvatarColor | string | null | undefined;

/** Accent classes for a space colour, falling back to the primary accent for unset/unknown values. */
export const getSpaceAccent = (color: SpaceColor): SpaceAccentClasses =>
  spaceAccentClasses[color ?? UserAvatarColor.Primary] ?? spaceAccentClasses[UserAvatarColor.Primary];

/** Gradient classes for a space colour, falling back to the primary gradient for unset/unknown values. */
export const getSpaceGradientClass = (color: SpaceColor): string =>
  spaceGradientClasses[color ?? UserAvatarColor.Primary] ?? spaceGradientClasses[UserAvatarColor.Primary];
