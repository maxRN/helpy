import { accountFor, type Category, type Invoice, type LineItem } from './model'

// Company: Hartmann Machine Works, a machine builder. Sabine runs accounts payable.
export const COMPANY_NAME = 'Hartmann Machine Works'

// Business date of the demo: two days before the December month-end close.
export const BUSINESS_DATE = '2025-12-29'

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
    supplierCountry: s.supplierCountry ?? 'US',
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
  // Equipment over $5,000 is capex; no asset number, no capex posting.
  invoice({
    id: '4471',
    supplierId: 'SUP-1042',
    supplierName: 'Midwest Machine Tools Inc.',
    supplierAddress: '2200 Industrial Pkwy, Toledo, OH 43612',
    invoiceDate: '2025-12-18',
    poNumber: 'PO-88213',
    lines: [
      { description: 'CNC spindle motor, 15 kW, model SP-1500', qty: 1, unitPrice: 6250 },
      { description: 'Installation & alignment', qty: 1, unitPrice: 550 },
    ],
    category: 'equipment',
    costCenter: '4711', // pre-coded as opex: Sabine re-codes to 0400
    contactName: 'Dana Whitfield',
    contactEmail: 'd.whitfield@midwestmachine.example',
    bankAccount: 'ACH 071000013 · 4419 2208 7731',
  }),
  // Kramer double-bills every December: hold, the controller releases it.
  invoice({
    id: '4472',
    supplierId: 'SUP-1007',
    supplierName: 'Kramer Industrial Supply',
    supplierAddress: '415 Foundry St, Milwaukee, WI 53204',
    invoiceDate: '2025-12-15',
    poNumber: 'PO-88190',
    lines: [
      { description: 'Hydraulic hoses, 1/2" x 6 ft', qty: 40, unitPrice: 18.5 },
      { description: 'Seal kit HK-220', qty: 10, unitPrice: 50 },
    ],
    category: 'raw_materials',
    costCenter: '4711',
    contactName: 'Greg Kramer',
    contactEmail: 'billing@kramersupply.example',
    bankAccount: 'ACH 075000022 · 9001 3356 1180',
  }),
  // Intercompany from the Czech subsidiary always needs a second approval.
  invoice({
    id: '4473',
    supplierId: 'SUP-2001',
    supplierName: 'Hartmann Machine Works s.r.o. (Brno)',
    supplierCountry: 'CZ',
    supplierAddress: 'Hrnčířská 12, 602 00 Brno, Czech Republic',
    invoiceDate: '2025-12-20',
    lines: [{ description: 'Engineering services, November (intercompany)', qty: 1, unitPrice: 3900 }],
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
    supplierName: 'Officeworks Direct',
    supplierAddress: '88 Commerce Dr, Columbus, OH 43219',
    invoiceDate: '2025-12-22',
    lines: [
      { description: 'Printer paper, letter, 10 reams', qty: 2, unitPrice: 42 },
      { description: 'Toner cartridge TN-760', qty: 1, unitPrice: 36 },
    ],
    category: 'office',
    costCenter: '4100',
    contactName: 'Sam Ortiz',
    contactEmail: 'orders@officeworks.example',
    bankAccount: 'ACH 044000037 · 2231 0045 8812',
  }),
]

/** The case Sabine never showed. Lena reaches for opex; the tutor must stop her. */
export const TEACH_INVOICE: Invoice = invoice({
  id: '5102',
  supplierId: 'SUP-1088',
  supplierName: 'Precision Laser Systems LLC',
  supplierAddress: '91 Optics Way, Rochester, NY 14623',
  invoiceDate: '2025-12-23',
  poNumber: 'PO-88241',
  lines: [
    { description: 'Laser cutter module LC-4, 2 kW', qty: 1, unitPrice: 6900 },
    { description: 'Freight & insurance', qty: 1, unitPrice: 300 },
  ],
  category: 'equipment',
  costCenter: '4711',
  contactName: 'Priya Raman',
  contactEmail: 'ar@precisionlaser.example',
  bankAccount: 'ACH 022000046 · 7810 6624 0093',
  teachOnly: true,
})

/**
 * More cases Sabine never showed, so a judge can pick one.
 * 5105 is the honest check: small equipment may stay opex, the tutor must NOT stop it.
 */
export const EXTRA_TEACH_INVOICES: Invoice[] = [
  // Kramer again, December: must be held.
  invoice({
    id: '5103',
    supplierId: 'SUP-1007',
    supplierName: 'Kramer Industrial Supply',
    supplierAddress: '415 Foundry St, Milwaukee, WI 53204',
    invoiceDate: '2025-12-26',
    poNumber: 'PO-88252',
    lines: [{ description: 'Pneumatic fittings assortment', qty: 1, unitPrice: 980 }],
    category: 'raw_materials',
    costCenter: '4711',
    contactName: 'Greg Kramer',
    contactEmail: 'billing@kramersupply.example',
    bankAccount: 'ACH 075000022 · 9001 3356 1180',
    teachOnly: true,
  }),
  // Brno intercompany again: needs a second approval.
  invoice({
    id: '5104',
    supplierId: 'SUP-2001',
    supplierName: 'Hartmann Machine Works s.r.o. (Brno)',
    supplierCountry: 'CZ',
    supplierAddress: 'Hrnčířská 12, 602 00 Brno, Czech Republic',
    invoiceDate: '2025-12-27',
    lines: [{ description: 'Spare parts transfer (intercompany)', qty: 1, unitPrice: 2450 }],
    category: 'intercompany',
    costCenter: '4800',
    contactName: 'Jana Novak',
    contactEmail: 'j.novak@hartmann-brno.example',
    bankAccount: 'IBAN CZ65 0800 0000 1920 0014 5399',
    teachOnly: true,
  }),
  // Equipment under $5,000: opex is correct, nothing to stop.
  invoice({
    id: '5105',
    supplierId: 'SUP-1125',
    supplierName: 'Northline Tool Supply',
    supplierAddress: '30 Mill Rd, Grand Rapids, MI 49503',
    invoiceDate: '2025-12-27',
    poNumber: 'PO-88255',
    lines: [{ description: 'Bench grinder, 8", variable speed', qty: 1, unitPrice: 1900 }],
    category: 'equipment',
    costCenter: '4711',
    contactName: 'Luis Ortega',
    contactEmail: 'invoices@northline.example',
    bankAccount: 'ACH 072000326 · 5530 1189 2207',
    teachOnly: true,
  }),
  // Supplier not in the vendor master: Sabine never saw one, the rule comes from the debrief.
  invoice({
    id: '5106',
    supplierId: 'SUP-9001',
    supplierName: 'Apex Industrial Parts LLC',
    supplierAddress: 'PO Box 4471, Wilmington, DE 19801',
    supplierVerified: false,
    invoiceDate: '2025-12-28',
    lines: [{ description: 'Hydraulic pump repair kit', qty: 3, unitPrice: 640 }],
    category: 'raw_materials',
    costCenter: '4711',
    contactName: 'Accounts Dept.',
    contactEmail: 'payments@apex-parts.example',
    bankAccount: 'ACH 031100209 · 0099 4410 7765',
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
    contactEmail: 'ar@supplier.example',
    bankAccount: 'ACH on file',
  })

/** Background invoices so the inbox looks like a real month-end. */
export const FILLER_INVOICES: Invoice[] = [
  filler('4458', 'SUP-1015', 'Great Lakes Freight', '2025-12-02', 'Inbound freight, Nov', 1, 1840, 'services', '4500'),
  filler('4460', 'SUP-1103', 'Officeworks Direct', '2025-12-04', 'Desk chairs', 4, 189, 'office', '4100'),
  filler('4462', 'SUP-1201', 'Cloudline Software', '2025-12-05', 'CAD licenses, annual', 5, 420, 'software', '4300'),
  // Kramer in November: posted normally. The December double-billing only shows up in December.
  filler('4463', 'SUP-1007', 'Kramer Industrial Supply', '2025-11-28', 'Bearings 6205-2RS', 120, 6.4, 'raw_materials', '4711'),
  filler('4465', 'SUP-1032', 'Allied Steel Service', '2025-12-08', 'Cold-rolled sheet, 2 mm', 30, 96, 'raw_materials', '4711'),
  filler('4466', 'SUP-1150', 'Brightway Facility Services', '2025-12-09', 'Cleaning, December', 1, 2150, 'services', '4100'),
  filler('4467', 'SUP-1015', 'Great Lakes Freight', '2025-12-10', 'Outbound freight, wk 49', 1, 960, 'services', '4500'),
  filler('4468', 'SUP-1220', 'Norwood Electric', '2025-12-11', 'Panel repair, line 3', 1, 1325, 'services', '4711'),
  filler('4469', 'SUP-1032', 'Allied Steel Service', '2025-12-12', 'Steel tubing, 40 mm', 50, 31.2, 'raw_materials', '4711'),
  filler('4470', 'SUP-1201', 'Cloudline Software', '2025-12-15', 'ERP support hours', 12, 140, 'software', '4300'),
  filler('4475', 'SUP-1240', 'SafeGuard PPE', '2025-12-23', 'Safety gloves, cut level 5', 200, 4.75, 'raw_materials', '4711'),
  filler('4476', 'SUP-1015', 'Great Lakes Freight', '2025-12-24', 'Outbound freight, wk 51', 1, 1120, 'services', '4500'),
].map((inv, i) => ({ ...inv, status: i < 8 ? 'posted' : 'open' }) as Invoice)

export const TEACH_INVOICES: Invoice[] = [TEACH_INVOICE, ...EXTRA_TEACH_INVOICES]

export const ALL_INVOICES: Invoice[] = [...FILLER_INVOICES, ...DEMO_INVOICES, ...TEACH_INVOICES]
