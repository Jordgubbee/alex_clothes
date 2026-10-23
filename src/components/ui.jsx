import { useRef, useState } from 'react'

export function Button({ variant = 'default', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none select-none'
  const sizes = { sm: 'h-7 px-2.5 text-xs', md: 'h-8 px-3 text-[13px]', icon: 'h-8 w-8' }
  const variants = {
    default: 'bg-ink-800 text-ink-100 hover:bg-ink-700 border border-ink-700',
    primary: 'bg-accent text-ink-950 hover:bg-[#f0b250]',
    ghost: 'text-ink-300 hover:text-ink-100 hover:bg-ink-800',
    danger: 'text-red-300 hover:bg-red-500/10 border border-ink-700',
  }
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-md border border-ink-700 bg-ink-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded px-3 text-xs font-medium transition-colors ${value === o.value ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-500">{hint}</span>}
    </label>
  )
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`h-8 w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 text-[13px] text-ink-100 outline-none placeholder:text-ink-500 focus:border-ink-500 ${props.className || ''}`}
    />
  )
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className="h-8 w-full rounded-md border border-ink-700 bg-ink-900 px-2 text-[13px] text-ink-100 outline-none focus:border-ink-500">
      {children}
    </select>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, format = (v) => v }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-ink-400">
        <span>{label}</span>
        <span className="tabular-nums text-ink-300">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full" />
    </div>
  )
}

export function FilePick({ accept, multiple, folder, onFiles, children, className = '', variant = 'default', size = 'md' }) {
  const ref = useRef()
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => ref.current.click()}>
        {children}
      </Button>
      <input
        ref={ref}
        type="file"
        hidden
        accept={folder ? undefined : accept}
        multiple={multiple || folder}
        {...(folder ? { webkitdirectory: '', directory: '' } : {})}
        onChange={(e) => {
          const files = [...e.target.files]
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </>
  )
}

// id + collapsible: kan fällas ihop, och läget kommer ihåg mellan gångerna.
export function Section({ title, action, children, id, collapsible = false, defaultOpen = true }) {
  const key = id && `alex.section.${id}`
  const [open, setOpen] = useState(() => {
    try {
      const v = key && localStorage.getItem(key)
      return v === null || v === undefined ? defaultOpen : v === '1'
    } catch {
      return defaultOpen
    }
  })
  const toggle = () => {
    setOpen(!open)
    try {
      if (key) localStorage.setItem(key, open ? '0' : '1')
    } catch {
      // Inte viktigt om det inte går att spara.
    }
  }
  return (
    <section className="border-b border-ink-800 px-4 py-3">
      {(title || action) && (
        <div className={`flex items-center justify-between ${open ? 'mb-3' : ''}`}>
          {collapsible ? (
            <button onClick={toggle} className="flex items-center gap-1.5 text-xs font-semibold text-ink-200 hover:text-ink-100">
              <svg viewBox="0 0 16 16" className={`h-3 w-3 text-ink-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="currentColor">
                <path d="M6 3l5 5-5 5z" />
              </svg>
              {title}
            </button>
          ) : (
            <h3 className="text-xs font-semibold text-ink-200">{title}</h3>
          )}
          {open && action}
        </div>
      )}
      {open && children}
    </section>
  )
}

// Enkla linjeikoner, ritade för 16px.
const paths = {
  pointer: 'M3 2l9 5-4 1.2L6.5 13z M8.2 8.4 11 12.5',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  eyeoff: 'M2 2l12 12 M6.5 4c.5-.3 1-.5 1.5-.5 4 0 6.5 4.5 6.5 4.5a12 12 0 0 1-1.7 2.2 M4 5.5A12 12 0 0 0 1.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7',
  merge: 'M4 2v4l4 4 4-4V2 M8 10v4',
  move: 'M8 1v14M1 8h14M8 1 6 3m2-2 2 2M8 15l-2-2m2 2 2-2M1 8l2-2M1 8l2 2m12-2-2-2m2 2-2 2',
  brush: 'M10.5 2.5 13.5 5.5 7 12H4V9z M3 14h4',
  eraser: 'M6 14h8M2.5 10.5l6-6 4 4-5 5H5z',
  clone: 'M5 3h8v8H5z M3 5v8h8',
  heal: 'M2 4h12v8H2z M6 8h4 M8 6v4',
  fill: 'M2 3h12v10H2z M2 9h12',
  text: 'M3 3h10 M8 3v10 M6 13h4',
  picker: 'M11 2l3 3-7 7H4v-3z M2 14l2-2',
  image: 'M2 3h12v10H2z M2 11l4-4 3 3 2-2 3 3 M10.5 6.5h.01',
  undo: 'M5 4 2 7l3 3 M2 7h8a4 4 0 0 1 0 8H8',
  redo: 'M11 4l3 3-3 3 M14 7H6a4 4 0 0 0 0 8h2',
  plus: 'M8 3v10M3 8h10',
  trash: 'M3 4h10 M6 4V2.5h4V4 M4.5 4l.5 9.5h6l.5-9.5',
  up: 'M8 12V4M4.5 7.5 8 4l3.5 3.5',
  down: 'M8 4v8M4.5 8.5 8 12l3.5-3.5',
  select: 'M2 2h3M7 2h2M11 2h3v3M14 7v2M14 11v3h-3M9 14H7M5 14H2v-3M2 9V7M2 5V2',
  fit: 'M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4',
  download: 'M8 2v8 M4.5 6.5 8 10l3.5-3.5 M3 13h10',
}

export function Icon({ name, className = '' }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}
