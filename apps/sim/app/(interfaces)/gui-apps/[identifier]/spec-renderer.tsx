'use client'

import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from 'react'
import type { Spec } from '@json-render/core'
import { cn } from '@sim/emcn'
import { displayTextFromActionData } from '@/lib/arena-generative-ui/types'
import { MarkdownText } from '@/app/(interfaces)/gui-apps/[identifier]/markdown-text'

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

interface SpecRendererProps {
  spec: Spec
  state: Record<string, unknown>
  pending: boolean
  onNavigate: (path: string) => void
  onRunAction: (actionId: string, values: Record<string, unknown>) => Promise<void>
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function asPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return fallback
}

const DEFAULT_PROGRESS_DURATION_MS = 150_000

interface ProgressStepsViewProps {
  pending: boolean
  steps: string[]
  durationMs: number
}

function ProgressStepsView({ pending, steps, durationMs }: ProgressStepsViewProps) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!pending) {
      setElapsedMs(0)
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 100)
    return () => clearInterval(timer)
  }, [pending])

  if (!pending || steps.length === 0) {
    return null
  }

  const sliceMs = durationMs / steps.length
  const completedCount = Math.min(steps.length - 1, Math.floor(elapsedMs / sliceMs))

  return (
    <ol className='flex flex-col gap-2 text-sm'>
      {steps.map((label, index) => {
        const done = index < completedCount
        const current = index === completedCount
        return (
          <li
            key={`${index}-${label}`}
            className={cn(
              'flex items-center gap-2',
              done && 'text-[var(--color-ds-grey-800,#1f232d)]',
              current && 'text-[var(--color-ds-grey-800,#1f232d)]',
              !done && !current && 'text-[var(--color-ds-grey-400,#a0a3ad)]'
            )}
          >
            <span className='inline-flex size-5 items-center justify-center rounded-full border border-[var(--color-ds-grey-300,#c5c6cc)] text-xs'>
              {done ? '✓' : current ? '…' : ''}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

function readStatePath(state: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, state)
}

function displayFromStateValue(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  const fromAction = displayTextFromActionData(value)
  if (fromAction) return fromAction
  return String(value)
}

function submitButtonActionId(
  elements: Record<string, SpecElement>,
  childIds: string[]
): string {
  for (const childId of childIds) {
    const child = elements[childId]
    if (!child) continue
    if (child.type === 'SubmitButton') {
      const actionId = asString(child.props?.actionId)
      if (actionId) return actionId
    }
    const nested = submitButtonActionId(elements, child.children ?? [])
    if (nested) return nested
  }
  return ''
}

function styleFromProps(props: Record<string, unknown>): CSSProperties {
  const style: CSSProperties = {}
  const backgroundColor = asString(props.backgroundColor)
  const color = asString(props.color)
  const padding = asString(props.padding)
  const maxWidth = asString(props.maxWidth)
  const gap = asString(props.gap)
  const size = asString(props.size)
  if (backgroundColor) style.backgroundColor = backgroundColor
  if (color) style.color = color
  if (padding) style.padding = padding
  if (maxWidth) style.maxWidth = maxWidth
  if (gap) style.gap = gap
  if (size) style.fontSize = size
  return style
}

/**
 * Walks a json-render Spec and renders Arena Generative UI catalog components.
 */
export function SpecRenderer({ spec, state, pending, onNavigate, onRunAction }: SpecRendererProps) {
  const elements = (spec.elements ?? {}) as Record<string, SpecElement>
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  const renderNode = (id: string): ReactNode => {
    const element = elements[id]
    if (!element) return null
    const props = element.props ?? {}
    const children = (element.children ?? []).map((childId) => (
      <span key={childId}>{renderNode(childId)}</span>
    ))

    switch (element.type) {
      case 'Page':
        return (
          <div
            className='min-h-full bg-[var(--color-ds-grey-50,#f7f8f9)]'
            style={styleFromProps(props)}
          >
            {asString(props.title) ? <h1 className='sr-only'>{asString(props.title)}</h1> : null}
            {children}
          </div>
        )
      case 'Section':
        return (
          <section className='mx-auto w-full max-w-3xl px-6 py-8' style={styleFromProps(props)}>
            {children}
          </section>
        )
      case 'Stack':
        return (
          <div
            className={cn(
              'flex',
              asString(props.direction, 'vertical') === 'horizontal' ? 'flex-row' : 'flex-col',
              asString(props.align) === 'center' && 'items-center',
              asString(props.align) === 'end' && 'items-end'
            )}
            style={{ gap: asString(props.gap, '12px'), ...styleFromProps(props) }}
          >
            {children}
          </div>
        )
      case 'Card':
        return (
          <div
            className='rounded-xl border border-[var(--color-ds-grey-200,#e2e3e5)] bg-white p-5 shadow-sm'
            style={styleFromProps(props)}
          >
            {asString(props.title) ? (
              <h2 className='mb-3 font-semibold text-lg'>{asString(props.title)}</h2>
            ) : null}
            {children}
          </div>
        )
      case 'Heading': {
        const level = asString(props.level, 'h2')
        const Tag = (['h1', 'h2', 'h3', 'h4'].includes(level) ? level : 'h2') as
          | 'h1'
          | 'h2'
          | 'h3'
          | 'h4'
        return (
          <Tag className='font-semibold tracking-tight' style={styleFromProps(props)}>
            {asString(props.text)}
          </Tag>
        )
      }
      case 'Text':
        return (
          <MarkdownText
            className='text-[var(--color-ds-grey-700,#3d414d)]'
            style={styleFromProps(props)}
            content={asString(props.text)}
          />
        )
      case 'DataText': {
        const value = readStatePath(state, asString(props.statePath))
        const display = displayFromStateValue(value, asString(props.fallback, ''))
        return (
          <MarkdownText className='font-medium' style={styleFromProps(props)} content={display} />
        )
      }
      case 'Alert': {
        const tone = asString(props.tone, 'info')
        return (
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              tone === 'error' && 'bg-red-50 text-red-800',
              tone === 'success' && 'bg-emerald-50 text-emerald-800',
              tone === 'warning' && 'bg-amber-50 text-amber-900',
              tone === 'info' && 'bg-sky-50 text-sky-900'
            )}
          >
            <MarkdownText content={asString(props.text)} />
          </div>
        )
      }
      case 'Spinner':
        return pending ? (
          <p className='text-[var(--color-ds-grey-500,#8a8d99)] text-sm'>
            {asString(props.label, 'Loading…')}
          </p>
        ) : null
      case 'ProgressSteps': {
        const steps = asString(props.steps)
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean)
        return (
          <ProgressStepsView
            pending={pending}
            steps={steps}
            durationMs={asPositiveNumber(props.durationMs, DEFAULT_PROGRESS_DURATION_MS)}
          />
        )
      }
      case 'Form': {
        const actionId =
          asString(props.actionId) || submitButtonActionId(elements, element.children ?? [])
        const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const values: Record<string, unknown> = { ...formValues }
          for (const [key, value] of form.entries()) {
            values[key] = String(value)
          }
          if (actionId) {
            void onRunAction(actionId, values)
          }
        }
        return (
          <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
            {children}
          </form>
        )
      }
      case 'TextInput':
      case 'TextArea': {
        const name = asString(props.name)
        const fieldId = `field-${name}`
        const common = {
          id: fieldId,
          name,
          required: asBoolean(props.required),
          placeholder: asString(props.placeholder) || undefined,
          value: formValues[name] ?? '',
          onChange: (event: { target: { value: string } }) =>
            setFormValues((current) => ({ ...current, [name]: event.target.value })),
          className:
            'w-full rounded-lg border border-[var(--color-ds-grey-300,#c5c6cc)] bg-white px-3 py-2 text-sm',
        }
        return (
          <div className='flex flex-col gap-1 text-sm'>
            {asString(props.label) ? (
              <label htmlFor={fieldId}>{asString(props.label)}</label>
            ) : null}
            {element.type === 'TextArea' ? (
              <textarea {...common} rows={4} />
            ) : (
              <input {...common} type='text' />
            )}
          </div>
        )
      }
      case 'Select': {
        const name = asString(props.name)
        const options = asString(props.options)
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean)
        return (
          <label className='flex flex-col gap-1 text-sm'>
            {asString(props.label) ? <span>{asString(props.label)}</span> : null}
            <select
              name={name}
              required={asBoolean(props.required)}
              value={formValues[name] ?? ''}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, [name]: event.target.value }))
              }
              className='w-full rounded-lg border border-[var(--color-ds-grey-300,#c5c6cc)] bg-white px-3 py-2 text-sm'
            >
              <option value=''>Select</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )
      }
      case 'SubmitButton':
        return (
          <button
            type='submit'
            disabled={pending}
            className='rounded-lg bg-[var(--color-ds-blue-600,#2563eb)] px-4 py-2 font-medium text-sm text-white disabled:opacity-60'
          >
            {asString(props.label, 'Submit')}
          </button>
        )
      case 'Button': {
        const href = asString(props.href)
        const navigateTo = asString(props.navigateTo)
        const actionId = asString(props.actionId)
        const className =
          'inline-flex items-center rounded-lg bg-[var(--color-ds-blue-600,#2563eb)] px-4 py-2 font-medium text-sm text-white'
        if (href) {
          return (
            <a href={href} className={className} style={styleFromProps(props)} rel='noreferrer'>
              {asString(props.label)}
            </a>
          )
        }
        return (
          <button
            type='button'
            className={className}
            style={styleFromProps(props)}
            disabled={pending}
            onClick={() => {
              if (navigateTo) onNavigate(navigateTo)
              if (actionId) void onRunAction(actionId, formValues)
            }}
          >
            {asString(props.label)}
          </button>
        )
      }
      case 'NavLink':
        return (
          <button
            type='button'
            className='text-[var(--color-ds-blue-600,#2563eb)] text-sm underline-offset-2 hover:underline'
            onClick={() => onNavigate(asString(props.to))}
          >
            {asString(props.label)}
          </button>
        )
      case 'Link':
        return (
          <a
            href={asString(props.href)}
            className='text-[var(--color-ds-blue-600,#2563eb)] underline-offset-2 hover:underline'
            style={styleFromProps(props)}
            rel='noreferrer'
          >
            {asString(props.label)}
          </a>
        )
      case 'Image':
        return (
          <img
            src={asString(props.src)}
            alt={asString(props.alt)}
            width={asString(props.width) || undefined}
            height={asString(props.height) || undefined}
          />
        )
      case 'Divider':
        return (
          <hr className='border-[var(--color-ds-grey-200,#e2e3e5)]' style={styleFromProps(props)} />
        )
      case 'List': {
        const Tag = asBoolean(props.ordered) ? 'ol' : 'ul'
        return <Tag className='list-inside pl-1'>{children}</Tag>
      }
      case 'ListItem':
        return (
          <li>
            <MarkdownText content={asString(props.text)} />
          </li>
        )
      default:
        return <div>{children}</div>
    }
  }

  return <>{renderNode(spec.root)}</>
}
