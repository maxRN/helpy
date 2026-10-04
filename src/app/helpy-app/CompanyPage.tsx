import { Avatar } from '../panel/SignInView'
import { statusOf, useProcesses } from '../panel/processes'
import { COMPANY } from './company'
import { helpyApp } from './store'
import { card, pageTitle, sectionTitle } from './ui'

function Facts({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="m-0 mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-[auto_minmax(0,1fr)]">
      {items.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-[15px] text-muted">{f.label}</dt>
          <dd className="m-0 text-[16px] text-ink">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The first page: the standard things a new colleague needs to know, and what Helpy already knows. */
export function CompanyPage() {
  const processes = useProcesses() ?? []
  const ready = processes.filter((p) => statusOf(p) === 'ready').length
  const rules = processes.reduce((n, p) => n + (p.workMap?.guardrails.length ?? 0), 0)
  const { department } = COMPANY

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="m-0 text-[15px] font-medium text-helpy">Company info</p>
        <h1 className={`${pageTitle} mt-1`}>{COMPANY.name}</h1>
        <p className="m-0 mt-2 max-w-2xl text-[17px] leading-snug text-muted">{COMPANY.about}</p>
      </div>

      <button
        type="button"
        onClick={() => helpyApp.go({ name: 'processes' })}
        className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl bg-helpy-soft px-5 py-4 text-left transition-colors duration-150 hover:bg-[#dcefe8]"
      >
        <span className="text-[16px] font-medium text-ink">What Helpy knows</span>
        <span className="text-[16px] text-ink">
          <b className="tabular-nums">{processes.length}</b> recorded processes
        </span>
        <span className="text-[16px] text-ink">
          <b className="tabular-nums">{ready}</b> ready to learn
        </span>
        <span className="text-[16px] text-ink">
          <b className="tabular-nums">{rules}</b> rules
        </span>
        <span className="ml-auto text-[16px] font-medium text-helpy">See the processes ›</span>
      </button>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className={sectionTitle}>The company</h2>
          <Facts items={COMPANY.facts} />
        </section>

        <section className={card}>
          <h2 className={sectionTitle}>{department.name}</h2>
          <p className="m-0 mt-2 text-[16px] leading-snug text-muted">{department.about}</p>
          <Facts items={[...department.calendar, ...department.systems.map((s) => ({ label: s.name, value: s.what }))]} />
        </section>

        <section className={card}>
          <h2 className={sectionTitle}>People</h2>
          <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {COMPANY.people.map((p) => (
              <li key={p.name} className="flex items-center gap-3">
                <Avatar name={p.name} size={40} />
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium text-ink">
                    {p.name} <span className="font-normal text-muted">· {p.role}</span>
                  </span>
                  <span className="block text-[14px] text-muted">{p.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className={sectionTitle}>Cost centers</h2>
          <table className="mt-3 w-full border-collapse text-left text-[15px]">
            <thead>
              <tr className="text-muted">
                <th className="pb-2 font-medium">Code</th>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Account</th>
              </tr>
            </thead>
            <tbody>
              {COMPANY.costCenters.map((c) => (
                <tr key={c.code} className="border-t border-helpy-line">
                  <td className="py-2 font-mono tabular-nums text-ink">{c.code}</td>
                  <td className="py-2 text-ink">{c.name}</td>
                  <td className="py-2 text-muted">{c.account === 'capex' ? 'Capex' : 'Opex'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
