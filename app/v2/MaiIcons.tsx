import type { ReactNode } from 'react'

const paths: Record<string, string> = {
  menu:'M4 7h16M4 12h16M4 17h16', plus:'M12 5v14M5 12h14', search:'m20 20-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  inbox:'M4 5h16v14H4zM4 14h5l2 3h2l2-3h5', today:'M6 3v3m12-3v3M4 8h16v12H4zM8 12h4v4H8z', upcoming:'M6 3v3m12-3v3M4 8h16v12H4zM8 12h8m-8 4h5', calendar:'M6 3v3m12-3v3M4 8h16v12H4z',
  settings:'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.04.08H10l-.04-.08a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1l-.08-.04V10L4 9.96a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88L4.2 7.02 7.02 4.2l.06.06A1.7 1.7 0 0 0 8.96 4.6a1.7 1.7 0 0 0 1-.6l.04-.08h3.96L14 4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.08.4.3.75.6 1l.08.04V14L20 14.04c-.3.25-.52.6-.6.96Z',
  habits:'M17 2l4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3', goals:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-5a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', notes:'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5', finance:'M3 6h16v14H3zM3 9h18v7h-5a3 3 0 0 1 0-6h5', health:'M12 21S3 15.5 3 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 2.5C21 15.5 12 21 12 21Z', files:'M3 6h7l2 2h9v11H3z', chevron:'m9 18 6-6-6-6', close:'M6 6l12 12M18 6 6 18'
}

export function MaiIcon({ name, size = 18 }: { name: string; size?: number }): ReactNode {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}
