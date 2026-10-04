import { useId } from 'react'
import type { MascotState } from '../shared/mascot'
import type { Pose } from './store'

interface RobotProps {
  state?: MascotState
  /** A gesture layered over the current voice-agent state. */
  pose?: Pose | null
  pointing?: boolean
  off?: boolean
  /** The existing 120:150 artboard keeps positioning and drag bounds unchanged. */
  size?: number
  className?: string
  title?: string
}

/** Ceramic Helpy. Existing r-* groups remain the animation rig used by helpy.css. */
export function Robot({ state = 'idle', pose = null, pointing = false, off = false, size = 84, className = '', title }: RobotProps) {
  const uid = useId().replace(/:/g, '')
  const id = (part: string) => `helpy-ceramic-${part}-${uid}`
  const paint = (part: string) => `url(#${id(part)})`

  return (
    <svg
      viewBox="0 0 120 150"
      width={size}
      height={(size * 150) / 120}
      className={`helpy-robot ${className}`}
      data-design="ceramic"
      data-state={state}
      data-pose={pose ?? undefined}
      data-pointing={pointing || undefined}
      data-off={off || undefined}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={id('shell')} x1="18%" y1="10%" x2="88%" y2="95%">
          <stop offset="0" stopColor="#fffefa" />
          <stop offset=".42" stopColor="#f7f8f2" />
          <stop offset=".77" stopColor="#e3e9e1" />
          <stop offset="1" stopColor="#becdc4" />
        </linearGradient>
        <linearGradient id={id('edge')} x1="0" y1="0" x2="1" y2=".6">
          <stop stopColor="#d1dbd3" />
          <stop offset=".65" stopColor="#ecf0e8" />
          <stop offset="1" stopColor="#a8bdb3" />
        </linearGradient>
        <radialGradient id={id('body')} cx="31%" cy="18%" r="88%">
          <stop stopColor="#fffffb" />
          <stop offset=".55" stopColor="#eef2e9" />
          <stop offset=".85" stopColor="#d8e2d8" />
          <stop offset="1" stopColor="#b7cbbd" />
        </radialGradient>
        <linearGradient id={id('visor')} x1="20%" y1="0" x2="78%" y2="100%">
          <stop stopColor="#294342" />
          <stop offset=".37" stopColor="#14282d" />
          <stop offset="1" stopColor="#0c1820" />
        </linearGradient>
        <linearGradient id={id('glass')} x1="0" y1="0" x2=".7" y2="1">
          <stop stopColor="#b8d3ca" stopOpacity=".18" />
          <stop offset=".67" stopColor="#b8d3ca" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('ear')} x1="0" y1="0" x2="1" y2=".6">
          <stop stopColor="#147b6a" />
          <stop offset=".48" stopColor="#5fe6c6" />
          <stop offset="1" stopColor="#c0f7e5" />
        </linearGradient>
        <radialGradient id={id('shadow')}>
          <stop stopColor="#1c4637" stopOpacity=".24" />
          <stop offset="1" stopColor="#1c4637" stopOpacity="0" />
        </radialGradient>
        <filter id={id('eye-light')} x="-35%" y="-20%" width="170%" height="140%">
          <feGaussianBlur stdDeviation=".65" result="light" />
          <feMerge><feMergeNode in="light" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <ellipse className="r-shadow" cx="61" cy="144" rx="30" ry="5.5" fill={paint('shadow')} />
      <g className="r-float">
        <g className="r-dots" fill="#107864">
          <circle className="r-dot" cx="50" cy="8" r="2.4" />
          <circle className="r-dot" cx="60" cy="8" r="2.4" />
          <circle className="r-dot" cx="70" cy="8" r="2.4" />
        </g>
        <g className="r-alert-mark">
          <circle cx="104" cy="15" r="8" fill="#a53f35" stroke="#fff8f2" strokeWidth="1.5" />
          <path d="M104 10.5v5.2" stroke="white" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="104" cy="19" r="1.1" fill="white" />
        </g>
        <text className="r-zz" x="99" y="16" fontSize="11" fontWeight="600" fill="#53695f">z</text>

        {/* Shoulder pivots match the existing animation coordinates (29,93 / 86,93). */}
        <g className="r-arm-left">
          <circle cx="29" cy="94" r="5.6" fill="#334843" />
          <path d="M25 93c-5 0-7 5-8 11l-1 9c-.4 5 2.3 8.2 6.3 8.5 3.7.3 6.3-2.4 6.8-6.6l2-13.4C32 96 29.8 93 25 93Z" fill={paint('shell')} stroke="#bbcfc1" strokeWidth=".55" />
          <path d="M20 100c-1.1 4.4-1.5 8.3-1.4 12.3" fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" opacity=".9" />
          <path d="M17.2 114.5c2.5 1.8 5.4 2.3 9.4 1.1" fill="none" stroke="#c2d1c7" strokeWidth=".7" />
        </g>

        <ellipse cx="59" cy="86" rx="13" ry="6" fill="#2b413b" />
        <path d="M59 84c16 0 24 10.6 25.5 25.5 1.5 17.5-7.7 29-24.5 29-17.5 0-27-11.6-25.8-28.7C35.3 95.2 43.3 84 59 84Z" fill={paint('body')} stroke="#bacebf" strokeWidth=".6" />
        <path d="M43 92c8-5.7 23-6.9 31-.1" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity=".85" />
        <path d="M45 132c8.5 4.7 20.3 4.8 29-.1" fill="none" stroke="#dce6da" strokeWidth=".9" opacity=".85" />
        <g className="r-chest-inset" fill="#bfdfd1">
          <rect x="50.7" y="106" width="5" height="11" rx="2.5" />
          <rect x="57.2" y="102.5" width="5" height="18" rx="2.5" />
          <rect x="63.7" y="106" width="5" height="11" rx="2.5" />
        </g>
        <g>
          <rect className="r-bar" x="51.5" y="106.7" width="3.4" height="9.6" rx="1.7" />
          <rect className="r-bar" x="58" y="103.2" width="3.4" height="16.6" rx="1.7" />
          <rect className="r-bar" x="64.5" y="106.7" width="3.4" height="9.6" rx="1.7" />
        </g>

        <g className="r-arm-raise">
          <circle cx="86" cy="94" r="5.6" fill="#334843" />
          <path d="M89 93c5 0 7 5 8 11l1 9c.4 5-2.3 8.2-6.3 8.5-3.7.3-6.3-2.4-6.8-6.6l-2-13.4C82 96 84.2 93 89 93Z" fill={paint('shell')} stroke="#b4c9bc" strokeWidth=".65" />
          <path d="M89 97c3.2 2.7 4.5 7 5 11.6" fill="none" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" opacity=".85" />
          <path d="M87.1 115.6c4 1.2 6.9.7 9.4-1.1" fill="none" stroke="#bacfc0" strokeWidth=".75" />
        </g>

        <g className="r-head">
          {/* One ceramic ear with a mint gasket gives a recognisable, asymmetric profile. */}
          <path d="M20 37c-8-3-13 1-13 9v13c0 8 5 12 13 9Z" fill={paint('ear')} stroke="#339d85" strokeWidth=".5" />
          <path d="M13 39c-5 0-7 3-7 9v9c0 6 2.4 9.5 7 9.5 3.8 0 5.5-3 5.5-8V47c0-5-1.8-8-5.5-8Z" fill={paint('shell')} stroke="#bdcfc2" strokeWidth=".6" />
          <path d="M10 44v15" fill="none" stroke="white" strokeWidth="1.1" strokeLinecap="round" opacity=".85" />
          <g className="r-ears-ring" fill="none" stroke="#27a88c" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1.5 43c-3 5-3 12 0 17" />
          </g>
          <path d="M43 17c-19 0-28 10-28 28v13c0 19 12 29 33 29h29c22 0 32-11 32-30V44c0-18-11-28-30-28Z" fill={paint('edge')} stroke="#bbccc1" strokeWidth=".65" />
          <path d="M42 17c-17 0-25 10-25 27v12c0 18 11 27 30 27h29c20 0 29-10 29-28V43c0-17-10-27-28-27Z" fill={paint('shell')} />
          <path d="M29 26c9-7.5 35-10 52-5.5" fill="none" stroke="#ffffff" strokeWidth="2.3" strokeLinecap="round" opacity=".88" />
          <path d="M94 29c6 5 8.5 12.5 8 23" fill="none" stroke="#d1ded3" strokeWidth="1.1" strokeLinecap="round" />
          {/* Recessed bevel, deep visor, and a restrained glass reflection. */}
          <path d="M45 28c-14 0-22 7-23 20l-.5 8c0 14 8 21 22 21h34c15 0 23-7 23-21v-7c0-14-8-21-23-21Z" fill="#aebfb5" />
          <path d="M45 29.8c-13.6 0-20.6 6.7-21.5 18.8l-.3 7.2c-.2 12.6 7.1 19 20.4 19h33.2c14.3 0 21.4-6.6 21.4-19v-6.5c0-13.3-7.3-19.5-21.6-19.5Z" fill={paint('visor')} />
          <path d="M45 31.5c-11.3 0-17.5 5-19.5 13.5 14-6.5 38-5 70 9v-5c0-11.8-6.8-17.5-19.8-17.5Z" fill={paint('glass')} />
          <path d="M34 71.5c7 2.5 38 2.8 51 .3" fill="none" stroke="#2e514a" strokeWidth=".7" opacity=".5" />
          <g className="r-gaze">
            <g className="r-eyes" filter={paint('eye-light')}>
              <rect className="r-eye" x="39" y="42" width="9.4" height="20" rx="4.7" />
              <rect className="r-eye" x="71" y="44" width="8.8" height="18" rx="4.4" />
              <path d="M41.7 46v7M73.6 48v5" fill="none" stroke="#d0ffee" strokeWidth="1.1" strokeLinecap="round" opacity=".7" />
            </g>
          </g>
          <g className="r-eyes-closed" fill="none" stroke="#68d8b9" strokeWidth="2.5" strokeLinecap="round">
            <path d="M39 54q4.7 3.5 9.4 0M71 55q4.4 3.3 8.8 0" />
          </g>
          <g className="r-eyes-happy" fill="none" stroke="#74e9c8" strokeWidth="3" strokeLinecap="round">
            <path d="M39 55q4.7-6.8 9.4 0M71 56q4.4-6.5 8.8 0" />
          </g>
        </g>
        <g className="r-chin-hand">
          <path d="M34 79c-1.5-3.2.6-6.3 3.8-6.2l6 .5c3 .3 4.1 3.4 2.6 5.9l-2.6 4.3c-1.8 2.8-5.6 2.7-7.3 0Z" fill={paint('shell')} stroke="#b6cbbd" strokeWidth=".6" />
          <path d="m36.7 76 5.5.4" fill="none" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}

/** Matching small mark; simplified so the single ear and asymmetrical eyes stay crisp. */
export function HelpyMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 40 32" width={size} height={(size * 32) / 40} className={className} aria-hidden>
      <rect x=".5" y="10" width="6" height="13" rx="3" fill="#5fe6c6" stroke="#107864" strokeWidth=".7" />
      <path d="M15 2h11c9 0 12 5 12 13v3c0 8-4 12-13 12H15C6 30 3 25 3 18v-3C3 6 7 2 15 2Z" fill="#f7faf3" stroke="#b6cabe" strokeWidth="1" />
      <path d="M15 7h11c5 0 8 3 8 8v3c0 5-3 7-8 7H15c-5 0-8-3-8-7v-3c0-5 3-8 8-8Z" fill="#14272b" />
      <rect x="12.5" y="11" width="4" height="9" rx="2" fill="#5fe6c6" />
      <rect x="24" y="12" width="3.8" height="8" rx="1.9" fill="#5fe6c6" />
    </svg>
  )
}
