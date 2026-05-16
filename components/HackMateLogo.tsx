"use client";

import type { SVGProps } from "react";
import { useId } from "react";

type Props = SVGProps<SVGSVGElement> & {
  /** Pixel width/height (square). */
  size?: number;
};

/** Abstract HM monogram — chunky strokes, teal H + violet M, slight tilt. */
export function HackMateLogo({ size = 32, className, ...rest }: Props) {
  const uid = useId().replace(/:/g, "");
  const gh = `hm-h-${uid}`;
  const gm = `hm-m-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      role="img"
      aria-hidden
      width={size}
      height={size}
      className={className}
      {...rest}
    >
      <defs>
        <linearGradient id={gh} x1="8" y1="12" x2="56" y2="116" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5eead4" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={gm} x1="120" y1="16" x2="52" y2="112" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c4b5fd" />
          <stop offset="0.6" stopColor="#818cf8" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <g transform="rotate(-5 64 64)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path stroke={`url(#${gh})`} strokeWidth="15" d="M28 102V26M28 64H54M54 102V26" />
        <path stroke={`url(#${gm})`} strokeWidth="15" d="M62 102V30L84 60L106 30V102" />
      </g>
      <circle cx="84" cy="24" r="5" fill="#fcd34d" opacity="0.95" />
    </svg>
  );
}
