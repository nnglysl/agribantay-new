export default function FarmIcon({ name = 'farm', size = 18 }) {
  const paths = {
    farm: <><path d="m3 10 9-6 9 6v11H3z" /><path d="M9 21v-7h6v7M7 11h1m8 0h1M12 4V2" /></>,
    owner: <><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    monitor: <><rect x="4" y="2" width="16" height="20" rx="3" /><path d="M8 6h8M8 11h2m4 0h2M8 15h2m4 0h2M11 19h2" /></>,
    drop: <path d="M12 2S4 11 4 16a8 8 0 0 0 16 0c0-5-8-14-8-14Z" />,
    air: <><path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7" /></>,
    temperature: <><path d="M9 14.5V5a3 3 0 1 1 6 0v9.5a5 5 0 1 1-6 0Z" /><path d="M12 8v10" /></>,
    records: <><path d="M8 3H5v19h14V3h-3" /><rect x="8" y="1" width="8" height="5" rx="1" /><path d="M8 11h8M8 15h8M8 19h5" /></>,
    check: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z" /><path d="m8 12 3 3 5-6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></>,
    warning: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    offline: <><path d="m3 3 18 18M2 8.8a16 16 0 0 1 3.6-2.1m3.9-1.1A16 16 0 0 1 22 8.8M5 12a11 11 0 0 1 3.7-1.8m5.7-.2A11 11 0 0 1 19 12m-11 3a6 6 0 0 1 7.3-.4M12 19h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M7 14h2m4 0h2m-8 4h2" /></>,
    cleanout: <><path d="m16 3-6 10m-4-1 9 5-3 5-10-5zM5 17l-1 2m4-1-1 2m4-1-1 2" /><path d="M17 16h4m-3 4h3" /></>,
    repeat: <><path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5" /></>,
    hourglass: <><path d="M6 3h12M6 21h12M7 3v4l5 5-5 5v4m10-18v4l-5 5 5 5v4M9 7h6m-6 11h6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    document: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6" /></>,
    'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></>,
    upload: <><path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5" /></>,
    edit: <><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m13 6 5 5" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.farm}</svg>
}
