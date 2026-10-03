import { useEffect, useState, type ReactNode } from 'react'
import { fieldTarget, useErp, type EditableField } from './store'
import { useTarget } from './useTarget'

const inputClass =
  'h-8 w-full rounded-sm border border-slate-300 bg-white px-2 text-[13px] text-slate-900 outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600 disabled:bg-slate-100 disabled:text-slate-500'

interface FieldShellProps {
  label: string
  targetId: string
  hint?: ReactNode
  children: ReactNode
}

/** Label + control, registered for the mascot under `targetId`. */
export function FieldShell({ label, targetId, hint, children }: FieldShellProps) {
  const ref = useTarget(targetId)
  return (
    <div ref={ref} className="grid grid-cols-[8.5rem_1fr] items-center gap-x-3 gap-y-0.5">
      <label htmlFor={targetId} className="text-[12px] font-medium text-slate-600">
        {label}
      </label>
      {children}
      {hint ? <div className="col-start-2 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  )
}

interface SelectFieldProps {
  invoiceId: string
  field: EditableField
  label: string
  options: { value: string; label: string }[]
  disabled?: boolean
  hint?: ReactNode
}

export function SelectField({ invoiceId, field, label, options, disabled, hint }: SelectFieldProps) {
  const value = useErp((s) => String(s.invoices[invoiceId]?.[field] ?? ''))
  const update = useErp((s) => s.update)
  const id = fieldTarget(field)
  return (
    <FieldShell label={label} targetId={id} hint={hint}>
      <select
        id={id}
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(e) => update(invoiceId, field, e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

interface TextFieldProps {
  invoiceId: string
  field: EditableField
  label: string
  placeholder?: string
  disabled?: boolean
  hint?: ReactNode
}

/** Commits on blur or Enter, so typing does not emit one event per keystroke. */
export function TextField({ invoiceId, field, label, placeholder, disabled, hint }: TextFieldProps) {
  const stored = useErp((s) => String(s.invoices[invoiceId]?.[field] ?? ''))
  const update = useErp((s) => s.update)
  const [draft, setDraft] = useState(stored)
  useEffect(() => setDraft(stored), [stored])
  const id = fieldTarget(field)
  const commit = () => update(invoiceId, field, draft.trim())
  return (
    <FieldShell label={label} targetId={id} hint={hint}>
      <input
        id={id}
        className={inputClass}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
    </FieldShell>
  )
}
