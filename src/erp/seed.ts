import { accountFor, type Category, type Invoice, type LineItem } from './model'

// Company: Hartmann Machine Works, a machine builder near Stuttgart. Sabine has run accounts payable for 24 years.
export const COMPANY_NAME = 'Hartmann Machine Works'
/** Where invoices are billed to (shown on every invoice document). */
export const BILL_TO = 'Accounts Payable, 12 Benz Street, Leonberg 71229, Germany'

// Business date of the demo, as in the brief: Thursday, 4:10 pm, two working days before the September close
// (books close on Monday, 5 October).
export const BUSINESS_DATE = '2026-10-01'
export const POSTING_PERIOD = 'Sep 2026'

interface SeedInput {
  id: string
  supplierId: string
  supplierName: string
  supplierCountry?: string
  supplierAddress: string
  supplierVerified?: boolean
  invoiceDate: string
  dueInDays?: number
  poNumber?: string
  lines: LineItem[]
  category: Category
  costCenter: string
  contactName: string
  contactEmail: string
  bankAccount: string
  teachOnly?: boolean
}

function invoice(s: SeedInput): Invoice {
  const amount = Math.round(s.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0) * 100) / 100
  const date = new Date(`${s.invoiceDate}T12:00:00Z`)
  const due = new Date(date.getTime() + (s.dueInDays ?? 30) * 86_400_000)
  return {
    id: s.id,
    number: s.id,
    supplierId: s.supplierId,
    supplierName: s.supplierName,
    supplierCountry: s.supplierCountry ?? 'DE',
    supplierAddress: s.supplierAddress,
    supplierVerified: s.supplierVerified ?? true,
    invoiceDate: s.invoiceDate,
    dueDate: due.toISOString().slice(0, 10),
    month: date.getUTCMonth() + 1,
    poNumber: s.poNumber ?? '',
    lines: s.lines,
    amount,
    category: s.category,
    costCenter: s.costCenter,
    account: accountFor(s.costCenter),
    assetNumber: '',
    approver: '',
    approvalRequested: false,
    status: 'open',
    note: '',
    bankAccount: s.bankAccount,
    contactName: s.contactName,
    contactEmail: s.contactEmail,
    teachOnly: s.teachOnly,
  }
}

/**
 * The four demo invoices Sabine works through, in this order.
 * Each one hides a judgment call that is written down nowhere.
 */
export const DEMO_INVOICES: Invoice[] = [
  // Equipment over €5,000 is capex; no asset number, no capex posting.
  invoice({
    id: '4471',
    supplierId: 'SUP-1042',
    supplierName: 'Neckar Valley Machine Tools',
    supplierAddress: '22 Industrial Street, Kirchheim 73230, Germany',
    invoiceDate: '2026-09-21',
    poNumber: 'PO-88213',
    lines: [
      { description: 'CNC spindle motor, 15 kW, model SP-1500', qty: 1, unitPrice: 6250 },
      { description: 'Installation & alignment', qty: 1, unitPrice: 550 },
    ],
    category: 'equipment',
    costCenter: '4711', // pre-coded as opex: Sabine re-codes to 0400
    contactName: 'Daniela Weiss',
    contactEmail: 'd.weiss@neckarvalley-tools.example',
    bankAccount: 'IBAN DE21 6005 0101 7402 1188 31',
  }),
  // Kramer double-bills at every quarter-end: hold, the controller releases it.
  invoice({
    id: '4472',
    supplierId: 'SUP-1007',
    supplierName: 'Kramer Industrial Supply',
    supplierAddress: '15 Foundry Street, Stuttgart 70565, Germany',
    invoiceDate: '2026-09-22',
    poNumber: 'PO-88190',
    lines: [
      { description: 'Hydraulic hoses, DN12, 2 m', qty: 40, unitPrice: 18.5 },
      { description: 'Seal kit HK-220', qty: 10, unitPrice: 50 },
    ],
    category: 'raw_materials',
    costCenter: '4711',
    contactName: 'Georg Kramer',
    contactEmail: 'invoices@kramer-supply.example',
    bankAccount: 'IBAN DE47 6004 0071 0533 4419 00',
  }),
  // Intercompany from the Czech subsidiary always needs a second approval.
  invoice({
    id: '4473',
    supplierId: 'SUP-2001',
    supplierName: 'Hartmann Machine Works Brno (Czech subsidiary)',
    supplierCountry: 'CZ',
    supplierAddress: '12 Potters Street, Brno 602 00, Czech Republic',
    invoiceDate: '2026-09-24',
    lines: [{ description: 'Engineering services, September (intercompany)', qty: 1, unitPrice: 3900 }],
    category: 'intercompany',
    costCenter: '4800',
    contactName: 'Jana Novak',
    contactEmail: 'j.novak@hartmann-brno.example',
    bankAccount: 'IBAN CZ65 0800 0000 1920 0014 5399',
  }),
  // Control case: nothing special, just post it.
  invoice({
    id: '4474',
    supplierId: 'SUP-1103',
    supplierName: 'Office World Direct',
    supplierAddress: '40 King Street, Stuttgart 70173, Germany',
    invoiceDate: '2026-09-25',
    lines: [
      { description: 'Printer paper, A4, 10 reams', qty: 2, unitPrice: 42 },
      { description: 'Toner cartridge TN-760', qty: 1, unitPrice: 36 },
    ],
    category: 'office',
    costCenter: '4100',
    contactName: 'Sven Ostertag',
    contactEmail: 'orders@officeworld-direct.example',
    bankAccount: 'IBAN DE64 6005 0101 0002 2310 45',
  }),
]

/** The case Sabine never showed. Lena reaches for opex; the tutor must stop her. */
export const TEACH_INVOICE: Invoice = invoice({
  id: '5102',
  supplierId: 'SUP-1088',
  supplierName: 'Alb Valley Laser Systems',
  supplierAddress: '9 Lark Hill, Reutlingen 72770, Germany',
  invoiceDate: '2026-09-30',
  poNumber: 'PO-88241',
  lines: [
    { description: 'Laser cutter module LC-4, 2 kW', qty: 1, unitPrice: 6900 },
    { description: 'Freight & insurance', qty: 1, unitPrice: 300 },
  ],
  category: 'equipment',
  costCenter: '4711',
  contactName: 'Petra Ramsauer',
  contactEmail: 'accounts@albvalley-laser.example',
  bankAccount: 'IBAN DE18 6405 0000 0100 6624 93',
  teachOnly: true,
})

/**
 * More cases Sabine never showed, so a judge can pick one.
 * 5105 is the honest check: small equipment may stay opex, the tutor must NOT stop it.
 */
export const EXTRA_TEACH_INVOICES: Invoice[] = [
  // Kramer again, at the quarter-end: must be held.
  invoice({
    id: '5103',
    supplierId: 'SUP-1007',
    supplierName: 'Kramer Industrial Supply',
    supplierAddress: '15 Foundry Street, Stuttgart 70565, Germany',
    invoiceDate: '2026-09-30',
    poNumber: 'PO-88252',
    lines: [{ description: 'Pneumatic fittings assortment', qty: 1, unitPrice: 980 }],
    category: 'raw_materials',
    costCenter: '4711',
    contactName: 'Georg Kramer',
    contactEmail: 'invoices@kramer-supply.example',
    bankAccount: 'IBAN DE47 6004 0071 0533 4419 00',
    teachOnly: true,
  }),
  // Brno intercompany again: needs a second approval.
  invoice({
    id: '5104',
    supplierId: 'SUP-2001',
    supplierName: 'Hartmann Machine Works Brno (Czech subsidiary)',
    supplierCountry: 'CZ',
    supplierAddress: '12 Potters Street, Brno 602 00, Czech Republic',
    invoiceDate: '2026-09-30',
    lines: [{ description: 'Spare parts transfer (intercompany)', qty: 1, unitPrice: 2450 }],
    category: 'intercompany',
    costCenter: '4800',
    contactName: 'Jana Novak',
    contactEmail: 'j.novak@hartmann-brno.example',
    bankAccount: 'IBAN CZ65 0800 0000 1920 0014 5399',
    teachOnly: true,
  }),
  // Equipment under €5,000: opex is correct, nothing to stop.
  invoice({
    id: '5105',
    supplierId: 'SUP-1125',
    supplierName: 'North Star Tool Supply',
    supplierAddress: '30 Mill Street, Esslingen 73728, Germany',
    invoiceDate: '2026-10-01',
    poNumber: 'PO-88255',
    lines: [{ description: 'Bench grinder, 200 mm, variable speed', qty: 1, unitPrice: 1900 }],
    category: 'equipment',
    costCenter: '4711',
    contactName: 'Lukas Ott',
    contactEmail: 'invoices@northstar-tools.example',
    bankAccount: 'IBAN DE02 6115 0020 0102 2077 13',
    teachOnly: true,
  }),
  // Supplier not in the vendor master: Sabine never saw one, the rule comes from the debrief.
  invoice({
    id: '5106',
    supplierId: 'SUP-9001',
    supplierName: 'Apex Industrial Parts',
    supplierAddress: 'PO Box 10 22 33, Hamburg 20095, Germany',
    supplierVerified: false,
    invoiceDate: '2026-09-30',
    lines: [{ description: 'Hydraulic pump repair kit', qty: 3, unitPrice: 640 }],
    category: 'raw_materials',
    costCenter: '4711',
    contactName: 'Accounts Department',
    contactEmail: 'payments@apex-parts.example',
    bankAccount: 'IBAN DE75 2004 1155 0899 4410 76',
    teachOnly: true,
  }),
]

const filler = (
  id: string,
  supplierId: string,
  supplierName: string,
  invoiceDate: string,
  description: string,
  qty: number,
  unitPrice: number,
  category: Category,
  costCenter: string,
): Invoice =>
  invoice({
    id,
    supplierId,
    supplierName,
    supplierAddress: '—',
    invoiceDate,
    lines: [{ description, qty, unitPrice }],
    category,
    costCenter,
    contactName: 'Accounts Receivable',
    contactEmail: 'invoices@supplier.example',
    bankAccount: 'IBAN on file',
  })

/** Background invoices so the inbox looks like a real month-end. */
export const FILLER_INVOICES: Invoice[] = [
  filler('4458', 'SUP-1015', 'Rhine-Neckar Freight', '2026-09-01', 'Inbound freight, August', 1, 1840, 'services', '4500'),
  filler('4460', 'SUP-1103', 'Office World Direct', '2026-09-02', 'Desk chairs', 4, 189, 'office', '4100'),
  filler('4462', 'SUP-1201', 'Cloudline Software', '2026-09-03', 'CAD licences, annual', 5, 420, 'software', '4300'),
  // Kramer in August: posted normally. The double-billing only shows up at a quarter-end (March, June, September, December).
  filler('4463', 'SUP-1007', 'Kramer Industrial Supply', '2026-08-31', 'Bearings 6205-2RS', 120, 6.4, 'raw_materials', '4711'),
  filler('4465', 'SUP-1032', 'Rems Valley Steel', '2026-09-07', 'Cold-rolled sheet, 2 mm', 30, 96, 'raw_materials', '4711'),
  filler('4466', 'SUP-1150', 'Brightwork Facility Services', '2026-09-08', 'Cleaning, September', 1, 2150, 'services', '4100'),
  filler('4467', 'SUP-1015', 'Rhine-Neckar Freight', '2026-09-09', 'Outbound freight, week 37', 1, 960, 'services', '4500'),
  filler('4468', 'SUP-1220', 'Filder Electrical', '2026-09-10', 'Panel repair, line 3', 1, 1325, 'services', '4711'),
  filler('4469', 'SUP-1032', 'Rems Valley Steel', '2026-09-11', 'Steel tubing, 40 mm', 50, 31.2, 'raw_materials', '4711'),
  filler('4470', 'SUP-1201', 'Cloudline Software', '2026-09-14', 'ERP support hours', 12, 140, 'software', '4300'),
  filler('4475', 'SUP-1240', 'SafeGuard Workwear', '2026-09-28', 'Safety gloves, cut level 5', 200, 4.75, 'raw_materials', '4711'),
  filler('4476', 'SUP-1015', 'Rhine-Neckar Freight', '2026-09-30', 'Outbound freight, week 40', 1, 1120, 'services', '4500'),
].map((inv, i) => ({ ...inv, status: i < 8 ? 'posted' : 'open' }) as Invoice)

export const TEACH_INVOICES: Invoice[] = [TEACH_INVOICE, ...EXTRA_TEACH_INVOICES]

export const ALL_INVOICES: Invoice[] = [...FILLER_INVOICES, ...DEMO_INVOICES, ...TEACH_INVOICES]
