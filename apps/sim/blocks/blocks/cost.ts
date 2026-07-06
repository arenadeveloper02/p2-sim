import type { SVGProps } from 'react'
import { createElement } from 'react'
import { CircleDollarSign } from 'lucide-react'
import type { BlockConfig } from '@/blocks/types'

const CostIcon = (props: SVGProps<SVGSVGElement>) => createElement(CircleDollarSign, props)

const CURRENCY_OPTIONS = [
  { label: 'USD', id: 'USD' },
  { label: 'EUR', id: 'EUR' },
  { label: 'GBP', id: 'GBP' },
  { label: 'CAD', id: 'CAD' },
  { label: 'AUD', id: 'AUD' },
  { label: 'JPY', id: 'JPY' },
  { label: 'CHF', id: 'CHF' },
  { label: 'INR', id: 'INR' },
] as const

export const CostBlock: BlockConfig = {
  type: 'cost',
  name: 'Cost',
  description: 'Record third-party vendor cost not metered by Sim',
  longDescription:
    'Record external vendor spend that Sim does not already meter (custom APIs, BYOK integrations, batch logic). Supports fixed amounts, dynamic expressions, and values read from upstream block outputs.',
  bestPractices: `
  - Place after the block whose vendor cost you want to track (e.g. API → Cost).
  - Use fixed mode for a known per-call COGS amount.
  - Use expression mode to reference resolved values like <api.data.billing.cost>.
  - Use response path mode to read a numeric field from a specific upstream block output.
  - Do not double-count costs already metered by hosted Sim integrations or LLM blocks.
  `,
  category: 'blocks',
  bgColor: '#10B981',
  icon: CostIcon,
  docsLink: 'https://docs.sim.ai/workflows/blocks/cost',
  subBlocks: [
    {
      id: 'enabled',
      title: 'Enabled',
      type: 'switch',
      description: 'Master toggle for cost recording',
      value: () => 'true',
    },
    {
      id: 'mode',
      title: 'Amount mode',
      type: 'dropdown',
      options: [
        { label: 'Fixed amount', id: 'fixed' },
        { label: 'Expression', id: 'expression' },
        { label: 'Response path', id: 'response_path' },
      ],
      value: () => 'fixed',
      required: true,
    },
    {
      id: 'amount',
      title: 'Amount (USD)',
      type: 'short-input',
      placeholder: '0.01',
      description: 'Fixed cost per execution in the selected currency',
      condition: { field: 'mode', value: 'fixed' },
    },
    {
      id: 'amountExpression',
      title: 'Amount expression',
      type: 'short-input',
      placeholder: '<api.data.billing.cost>',
      description: 'Dynamic numeric value from workflow variables or prior block outputs',
      condition: { field: 'mode', value: 'expression' },
    },
    {
      id: 'sourceBlock',
      title: 'Source block',
      type: 'short-input',
      placeholder: 'API',
      description: 'Block name or ID whose output to read',
      condition: { field: 'mode', value: 'response_path' },
    },
    {
      id: 'responsePath',
      title: 'Response path',
      type: 'short-input',
      placeholder: 'data.usage.total_cost',
      description: 'Dot path on the source block output (e.g. data.meta.cost or headers.x-cost-usd)',
      condition: { field: 'mode', value: 'response_path' },
    },
    {
      id: 'currency',
      title: 'Currency',
      type: 'dropdown',
      options: [...CURRENCY_OPTIONS],
      value: () => 'USD',
      required: true,
    },
    {
      id: 'exchangeRate',
      title: 'USD exchange rate',
      type: 'short-input',
      placeholder: '1.08',
      description: 'Manual USD rate when currency is not USD (amount × rate = USD)',
      condition: { field: 'currency', value: 'USD', not: true },
      required: true,
    },
    {
      id: 'vendor',
      title: 'Vendor',
      type: 'short-input',
      placeholder: 'Twilio',
      description: 'Commercial vendor label for usage attribution',
    },
    {
      id: 'label',
      title: 'Label',
      type: 'short-input',
      placeholder: 'SMS send',
      description: 'Human-readable ledger line (defaults to vendor)',
    },
    {
      id: 'quantity',
      title: 'Quantity',
      type: 'short-input',
      placeholder: '1',
      description: 'Optional units consumed',
      mode: 'advanced',
    },
    {
      id: 'unit',
      title: 'Unit',
      type: 'short-input',
      placeholder: 'request',
      description: 'Unit for quantity (e.g. request, minute, credit)',
      mode: 'advanced',
    },
    {
      id: 'onlyOnSuccess',
      title: 'Only on success',
      type: 'switch',
      description: 'Skip recording when the source block errored',
      value: () => 'true',
      mode: 'advanced',
    },
    {
      id: 'skipIfZero',
      title: 'Skip if zero',
      type: 'switch',
      description: 'Do not emit a cost when the resolved amount is zero',
      value: () => 'true',
      mode: 'advanced',
    },
  ],
  tools: {
    access: [],
  },
  inputs: {
    enabled: { type: 'boolean', description: 'Master toggle for cost recording' },
    mode: { type: 'string', description: 'Amount resolution mode (fixed, expression, response_path)' },
    amount: { type: 'number', description: 'Fixed amount in the selected currency' },
    amountExpression: {
      type: 'number',
      description: 'Resolved numeric amount from an expression',
    },
    sourceBlock: { type: 'string', description: 'Upstream block name or ID for response path mode' },
    responsePath: {
      type: 'string',
      description: 'Dot path on the source block output',
    },
    currency: { type: 'string', description: 'ISO 4217 currency code' },
    exchangeRate: { type: 'number', description: 'Manual USD exchange rate for non-USD currency' },
    vendor: { type: 'string', description: 'Vendor label for ledger attribution' },
    label: { type: 'string', description: 'Human-readable ledger line' },
    quantity: { type: 'number', description: 'Optional units consumed' },
    unit: { type: 'string', description: 'Unit for quantity' },
    onlyOnSuccess: {
      type: 'boolean',
      description: 'Skip recording when the source block errored',
    },
    skipIfZero: { type: 'boolean', description: 'Do not emit cost when resolved amount is zero' },
  },
  outputs: {
    cost: {
      type: 'json',
      description: 'USD cost object ({ total, input, output }) consumed by billing',
    },
    raw: {
      type: 'json',
      description: 'Audit metadata (amount, currency, vendor, label, source mode)',
    },
    recorded: { type: 'boolean', description: 'Whether a positive cost was emitted' },
    passthrough: {
      type: 'json',
      description: 'Upstream block output forwarded unchanged when using response path mode',
    },
  },
}
