// Company info for the demo (Hartmann Machine Works is a mock company). Names, approvers and cost centers
// match the ProcureFlow mock (src/erp), so what a new hire reads here is what they see in the ERP.
import { APPROVERS, COST_CENTERS } from '../../erp/model'

export const COMPANY = {
  name: 'Hartmann Machine Works',
  about: 'A family-owned machine builder: laser cutting and metal forming machines for industrial customers.',
  facts: [
    { label: 'Headquarters', value: 'Milwaukee, Wisconsin' },
    { label: 'Plant', value: 'Brno, Czech Republic (Hartmann Machine Works s.r.o.)' },
    { label: 'Employees', value: 'About 420' },
    { label: 'Currency', value: 'US dollar' },
    { label: 'Fiscal year', value: 'January to December' },
  ],
  department: {
    name: 'Accounts payable',
    about: 'Checks, codes and posts every supplier invoice, and closes the books at the end of each month.',
    systems: [{ name: 'ProcureFlow', what: 'ERP: supplier invoices, cost centers, approvals and posting' }],
    calendar: [
      { label: 'Current posting period', value: 'December 2025' },
      { label: 'Month-end close', value: 'December 31, books closed two working days later' },
      { label: 'Payment run', value: 'Every Thursday' },
    ],
  },
  people: [
    { name: 'Sabine Brandt', role: 'Accounts payable, 31 years at Hartmann', note: 'Knows every supplier and every exception.' },
    { name: 'Lena Hoffmann', role: 'Accounts payable, new', note: 'Learning the process with Helpy.' },
    ...APPROVERS.filter(Boolean).map((a) => {
      const [, name, role] = a.match(/^(.*?) \((.*)\)$/) ?? [a, a, '']
      return { name: name!, role: role!, note: 'Gives second approvals.' }
    }),
  ],
  costCenters: COST_CENTERS,
}
