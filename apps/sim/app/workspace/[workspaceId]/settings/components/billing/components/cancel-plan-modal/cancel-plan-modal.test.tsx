/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sim/emcn', () => ({
  ChipModal: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-testid='cancel-plan-modal'>{children}</div> : null,
  ChipModalHeader: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  ChipModalBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChipModalFooter: ({
    primaryAction,
    primaryAdjacentAction,
  }: {
    primaryAction: { label: string; onClick: () => void }
    primaryAdjacentAction?: { label: string; onClick: () => void }
  }) => (
    <div>
      {primaryAdjacentAction ? (
        <button type='button' onClick={primaryAdjacentAction.onClick}>
          {primaryAdjacentAction.label}
        </button>
      ) : null}
      <button type='button' onClick={primaryAction.onClick}>
        {primaryAction.label}
      </button>
    </div>
  ),
}))

vi.mock('@sim/emcn/icons', () => ({
  CircleX: () => <span data-testid='loss-icon' />,
}))

import {
  CANCEL_PLAN_LOSS_FEATURES,
  CancelPlanModal,
} from '@/app/workspace/[workspaceId]/settings/components/billing/components/cancel-plan-modal/cancel-plan-modal'

describe('CancelPlanModal', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders Arena cancel copy, loss list, and plan-specific keep label', async () => {
    const onConfirmCancel = vi.fn()
    const onOpenChange = vi.fn()

    await act(async () => {
      root.render(
        <CancelPlanModal
          open
          onOpenChange={onOpenChange}
          planName='Max'
          isArena
          onConfirmCancel={onConfirmCancel}
        />
      )
    })

    expect(container.textContent).toContain('Cancel your plan?')
    expect(container.textContent).toContain('Starter is a one-time trial')
    expect(container.textContent).toContain('Keep Max')
    expect(container.textContent).toContain('Continue to Cancel')
    for (const feature of CANCEL_PLAN_LOSS_FEATURES) {
      expect(container.textContent).toContain(feature)
    }

    const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Continue to Cancel')
    )
    expect(continueButton).toBeTruthy()
    await act(async () => {
      continueButton?.click()
    })
    expect(onConfirmCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps the modal closed when open is false', async () => {
    await act(async () => {
      root.render(
        <CancelPlanModal
          open={false}
          onOpenChange={vi.fn()}
          planName='Max'
          isArena
          onConfirmCancel={vi.fn()}
        />
      )
    })

    expect(container.querySelector('[data-testid="cancel-plan-modal"]')).toBeNull()
  })
})
