import { useId } from 'react'
import type { MascotState } from '../shared/mascot'
import type { Pose } from './store'

interface RobotProps {
  state?: MascotState
  /** A gesture on top of the state: wave, cheer, or a raised hand (has a question). */
  pose?: Pose | null
  pointing?: boolean
  off?: boolean
  /** Rendered width in px; height follows the 120:150 artboard. */
  size?: number
  className?: string
  title?: string
}

/**
 * Helpy as in the pitch deck: white shell, dark visor, mint eyes, sound wave on the chest. Animated by CSS (helpy.css):
 * idle looks around, listening nods, thinking tilts its head with a hand at the chin, speaking moves the chest wave,
 * pointing raises an arm, alert hops red; poses wave hello, cheer, or raise a hand (has a question).
 */
export function Robot({ state = 'idle', pose = null, pointing = false, off = false, size = 84, className = '', title }: RobotProps) {
  const uid = useId().replace(/:/g, '')
  const shell = `hr-shell-${uid}`
  const visor = `hr-visor-${uid}`
  const glow = `hr-glow-${uid}`

  return (
    <svg
      viewBox="0 0 120 150"
      width={size}
      height={(size * 150) / 120}
      className={`helpy-robot ${className}`}
      data-state={state}
      data-pose={pose ?? undefined}
      data-pointing={pointing || undefined}
      data-off={off || undefined}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={shell} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9e3e1" />
        </linearGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2c35" />
          <stop offset="1" stopColor="#0c1820" />
        </linearGradient>
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="60" cy="145" rx="24" ry="4.5" fill="#0c1820" opacity="0.14" />

      <g className="r-float">
        <g className="r-dots">
          <circle className="r-dot" cx="49" cy="8" r="3.2" fill="#5fe6c6" />
          <circle className="r-dot" cx="60" cy="8" r="3.2" fill="#5fe6c6" />
          <circle className="r-dot" cx="71" cy="8" r="3.2" fill="#5fe6c6" />
        </g>
        <g className="r-alert-mark">
          <circle cx="103" cy="12" r="9.5" fill="#f04438" />
          <rect x="101.6" y="6" width="2.8" height="8" rx="1.4" fill="#fff" />
          <circle cx="103" cy="17.4" r="1.6" fill="#fff" />
        </g>
        <text className="r-zz" x="98" y="14" fontSize="12" fontWeight="800" fill="#5fe6c6">
          z
        </text>

        {/* left arm: hangs, goes to the chin (thinking), up (question, cheer) */}
        <g className="r-arm-left">
          <rect x="24" y="91" width="10" height="27" rx="5" fill={`url(#${shell})`} stroke="#c6d3d0" strokeWidth="0.8" transform="rotate(18 29 93)" />
        </g>

        <path
          d="M60 80 C80 80 89 97 89 112 C89 129 76 139 60 139 C44 139 31 129 31 112 C31 97 40 80 60 80 Z"
          fill={`url(#${shell})`}
          stroke="#c6d3d0"
          strokeWidth="0.8"
        />
        <g>
          <rect className="r-bar" x="52.5" y="106" width="3.4" height="10" rx="1.7" />
          <rect className="r-bar" x="58.3" y="102" width="3.4" height="18" rx="1.7" />
          <rect className="r-bar" x="64.1" y="106" width="3.4" height="10" rx="1.7" />
        </g>

        {/* right arm: points, waves, cheers; rotates around the shoulder */}
        <g className="r-arm-raise">
          <rect x="81" y="91" width="10" height="27" rx="5" fill={`url(#${shell})`} stroke="#c6d3d0" strokeWidth="0.8" transform="rotate(-18 86 93)" />
        </g>

        <g className="r-head">
          <rect x="12.5" y="40" width="9" height="22" rx="4.5" fill="#2bb39a" />
          <rect x="98.5" y="40" width="9" height="22" rx="4.5" fill="#2bb39a" />
          <g className="r-ears-ring" fill="none" stroke="#5fe6c6" strokeWidth="2.2" strokeLinecap="round">
            <path d="M7 41 a15 15 0 0 0 0 20" />
            <path d="M113 41 a15 15 0 0 1 0 20" />
          </g>

          <rect x="18" y="18" width="84" height="66" rx="31" fill={`url(#${shell})`} stroke="#c6d3d0" strokeWidth="0.8" />
          <ellipse cx="56" cy="25.5" rx="25" ry="3.6" fill="#ffffff" opacity="0.95" />
          <rect x="27" y="33" width="66" height="39" rx="19.5" fill={`url(#${visor})`} />

          <g className="r-gaze">
            <g className="r-eyes" filter={`url(#${glow})`}>
              <rect className="r-eye" x="42.5" y="43" width="10.5" height="18" rx="5.25" />
              <rect className="r-eye" x="67" y="43" width="10.5" height="18" rx="5.25" />
              <circle cx="46" cy="47" r="1.8" fill="#ffffff" opacity="0.85" />
              <circle cx="70.5" cy="47" r="1.8" fill="#ffffff" opacity="0.85" />
            </g>
          </g>
          <g className="r-eyes-closed" fill="none" stroke="#5fe6c6" strokeWidth="2.6" strokeLinecap="round">
            <path d="M42.5 53 q5.25 4 10.5 0" />
            <path d="M67 53 q5.25 4 10.5 0" />
          </g>
          <g className="r-eyes-happy" fill="none" stroke="#5fe6c6" strokeWidth="3" strokeLinecap="round" filter={`url(#${glow})`}>
            <path d="M42.5 55 q5.25 -7 10.5 0" />
            <path d="M67 55 q5.25 -7 10.5 0" />
          </g>
        </g>
        {/* thinking: a hand at the chin, drawn over the head */}
        <rect className="r-chin-hand" x="33" y="76" width="13" height="11" rx="5.5" fill={`url(#${shell})`} stroke="#c6d3d0" strokeWidth="0.8" />
      </g>
    </svg>
  )
}

/** Helpy's head only, for small brand marks (top bar, avatars). */
export function HelpyMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 40 32" width={size} height={(size * 32) / 40} className={className} aria-hidden>
      <rect x="3" y="1.5" width="34" height="28" rx="14" fill="#ffffff" stroke="#c9d3d0" strokeWidth="1.2" />
      <rect x="7.5" y="7" width="25" height="16" rx="8" fill="#13212a" />
      <rect x="13.5" y="10.5" width="4.2" height="9" rx="2.1" fill="#5fe6c6" />
      <rect x="22.3" y="10.5" width="4.2" height="9" rx="2.1" fill="#5fe6c6" />
    </svg>
  )
}
