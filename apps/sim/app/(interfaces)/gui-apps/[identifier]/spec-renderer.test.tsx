/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import type { Spec } from '@json-render/core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpecRenderer } from '@/app/(interfaces)/gui-apps/[identifier]/spec-renderer'

vi.mock('@sim/emcn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

const homeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Home' },
      children: ['nav', 'form'],
    },
    nav: {
      type: 'NavLink',
      props: { label: 'Results', to: 'results' },
      children: [],
    },
    form: {
      type: 'Form',
      props: { actionId: 'submit_lead' },
      children: ['name', 'submit'],
    },
    name: {
      type: 'TextInput',
      props: { name: 'name', label: 'Name' },
      children: [],
    },
    submit: {
      type: 'SubmitButton',
      props: { label: 'Submit' },
      children: [],
    },
  },
}

describe('SpecRenderer', () => {
  let unmount: (() => void) | undefined

  afterEach(() => {
    unmount?.()
    unmount = undefined
  })

  function render(onNavigate = vi.fn(), onRunAction = vi.fn().mockResolvedValue(undefined)) {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => {
      root.render(
        <SpecRenderer
          spec={homeSpec}
          state={{}}
          pending={false}
          onNavigate={onNavigate}
          onRunAction={onRunAction}
        />
      )
    })
    unmount = () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
    return { container, onNavigate, onRunAction }
  }

  it('navigates when a NavLink is clicked', () => {
    const { container, onNavigate } = render()
    const link = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Results'
    )
    expect(link).toBeTruthy()
    act(() => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onNavigate).toHaveBeenCalledWith('results')
  })

  it('posts form values through onRunAction', () => {
    const { container, onRunAction } = render()
    const input = container.querySelector('input[name="name"]') as HTMLInputElement
    const form = container.querySelector('form')
    expect(input).toBeTruthy()
    expect(form).toBeTruthy()

    act(() => {
      input.value = 'Ada'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onRunAction).toHaveBeenCalledWith(
      'submit_lead',
      expect.objectContaining({ name: 'Ada' })
    )
  })
})
