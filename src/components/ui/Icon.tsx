import type { SVGProps } from 'react'

export type IconName = 'search' | 'arrow' | 'back' | 'menu' | 'user' | 'mail' | 'lock' | 'building' | 'shield' | 'star' | 'check' | 'bookmark' | 'bell' | 'file' | 'heart' | 'lab' | 'surgery' | 'rehab' | 'diagnostics' | 'chevron' | 'close' | 'sliders'

export function Icon({ name, size = 24, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<IconName, React.ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" {...common}/><path d="M15.5 15.5 21 21" {...common}/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" {...common}/>, back: <path d="m14.5 5-7 7 7 7" {...common}/>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" {...common}/>, user: <><circle cx="12" cy="8" r="3.5" {...common}/><path d="M5 20c.7-4.1 3.1-6 7-6s6.3 1.9 7 6" {...common}/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" {...common}/><path d="m5 8 7 5 7-5" {...common}/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" {...common}/><path d="M8 10V7.5a4 4 0 0 1 8 0V10m-4 4v3" {...common}/></>,
    building: <path d="M4 21V7l8-4 8 4v14M8 9h1m3 0h1m3 0h1M8 13h1m3 0h1m3 0h1m-7 8v-4h4v4" {...common}/>,
    shield: <><path d="m12 3 8 3v5.5c0 5-3.2 8.7-8 10.5-4.8-1.8-8-5.5-8-10.5V6l8-3Z" {...common}/><path d="m8.5 12 2.5 2.5 4.8-5" {...common}/></>,
    star: <path d="m12 3.4 2.65 5.38 5.93.86-4.29 4.18 1.01 5.9-5.3-2.79-5.3 2.79 1.01-5.9-4.29-4.18 5.93-.86L12 3.4Z" fill="currentColor"/>,
    check: <path d="m5 12 4 4 10-10" {...common}/>, bookmark: <path d="M6 4h12v17l-6-4-6 4V4Z" {...common}/>, bell: <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7m4 11h4" {...common}/>,
    file: <path d="M6 3h8l4 4v14H6V3Zm8 0v5h5M9 12h6m-6 4h6" {...common}/>, heart: <path d="M12 21S4 16.2 4 9.5A5.3 5.3 0 0 1 9.3 4C11 4 12 5.1 12 5.1S13 4 14.7 4A5.3 5.3 0 0 1 20 9.5C20 16.2 12 21 12 21Z" {...common}/>,
    lab: <path d="M9 3h6m-5 0v6l-4.5 8.2A2.6 2.6 0 0 0 7.8 21h8.4a2.6 2.6 0 0 0 2.3-3.8L14 9V3M7.7 16h8.6" {...common}/>,
    surgery: <path d="M4 19 14.8 8.2m-1.3-2.7 5 5m-3.3-6.3 4.6 4.6L21 5.2 18.8 3l-3.6 1.2ZM4 19l-1 3 3-1-2-2Z" {...common}/>,
    rehab: <><circle cx="12" cy="5" r="2" {...common}/><path d="M12 8v6m0-4-4 3m4-3 4 3m-4 1-3.5 6m3.5-6 4 6M5 16c-1.2-2.4-.5-5.4 1.7-7" {...common}/></>,
    diagnostics: <><rect x="3" y="5" width="18" height="13" rx="3" {...common}/><path d="M6 12h3l2-4 3 7 2-3h2m-9 9h6" {...common}/></>,
    chevron: <path d="m7 9.5 5 5 5-5" {...common}/>, close: <path d="m6 6 12 12M18 6 6 18" {...common}/>, sliders: <path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M6 14v6" {...common}/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>{paths[name]}</svg>
}
