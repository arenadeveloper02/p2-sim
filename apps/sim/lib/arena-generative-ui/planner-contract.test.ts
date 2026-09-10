/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  PLANNER_ARCHETYPE_PROMPT,
  PLANNER_COMPOSITION_EXAMPLES_AGENT,
  PLANNER_COMPOSITION_PROMPT,
  PLANNER_CONSTRAINT_WAIT,
  PLANNER_CONTRACT_PROMPT,
  PLANNER_CORE_PROMPT,
  PLANNER_PACK_REMINDERS,
  buildPlannerSystemPrompt,
  requestSignalsHistory,
  requestSignalsWait,
  resolvePlannerConstraintModules,
} from '@/lib/arena-generative-ui/planner-contract'

describe('buildPlannerSystemPrompt', () => {
  it('keeps core, archetypes, composition, and pack reminders in every assembly', () => {
    const prompt = buildPlannerSystemPrompt({
      userInput: 'Simple todo list with create and complete.',
      intent: {
        task: 'Manage todos',
        audience: 'individuals',
        entities: [{ name: 'todo', kind: 'collection' }],
        dataRequirements: [],
        actions: [
          { id: 'create_todo', purpose: 'Add a todo' },
          { id: 'complete_todo', purpose: 'Mark done' },
        ],
        workflowComplexity: 'short',
      },
    })
    expect(prompt).toContain('You are the application planner')
    expect(prompt).toContain('SCOPE DISCIPLINE')
    expect(prompt).toContain('ARCHETYPE is the primary user job')
    expect(prompt).toContain('COMPOSITION SEMANTICS')
    expect(prompt).toContain('WHAT can be composed')
    expect(prompt).toContain('Todo → one collection page')
    expect(prompt).toContain('PACK REMINDERS (always)')
    expect(prompt).toContain(PLANNER_PACK_REMINDERS.slice(0, 40))
    expect(prompt).toContain('flat blueprint — not a nested app wrapper')
    expect(prompt.length).toBeLessThan(PLANNER_CONTRACT_PROMPT.length)
  })

  it('omits wait and agent History examples for a short todo', () => {
    const prompt = buildPlannerSystemPrompt({
      userInput: 'Simple todo list with create and complete.',
      intent: {
        task: 'Manage todos',
        audience: 'individuals',
        entities: [{ name: 'todo', kind: 'collection' }],
        dataRequirements: [],
        actions: [{ id: 'create_todo', purpose: 'Add a todo' }],
        workflowComplexity: 'short',
      },
    })
    expect(prompt).not.toContain('LONG-RUNNING: Use when the user asks')
    expect(prompt).not.toContain('COMPOSITION EXAMPLES (agent / history)')
    expect(prompt).not.toContain('STATS AND DASHBOARDS')
    expect(prompt).toContain('REPRESENTATION (collection body)')
    expect(prompt).toContain('PACK REMINDERS (always)')
  })

  it('injects wait for summarize synonyms without long-running intent wording', () => {
    const prompt = buildPlannerSystemPrompt({
      userInput: 'Summarize meeting notes into a brief.',
      intent: {
        task: 'Summarize meeting notes',
        audience: 'PMs',
        entities: [{ name: 'notes', kind: 'prose' }],
        dataRequirements: [],
        actions: [{ id: 'summarize', purpose: 'Draft a summary' }],
        workflowComplexity: 'short',
      },
    })
    expect(prompt).toContain('LONG-RUNNING: Use when the user asks')
  })

  it('uses safe defaults when intent is missing', () => {
    const modules = resolvePlannerConstraintModules({
      userInput: 'Build something useful',
    })
    expect(modules.has('wait')).toBe(true)
    expect(modules.has('collection')).toBe(true)
    expect(modules.has('secondary')).toBe(true)
    const prompt = buildPlannerSystemPrompt({ userInput: 'Build something useful' })
    expect(prompt).toContain('LONG-RUNNING: Use when the user asks')
    expect(prompt).toContain('SECONDARY PAGES only when')
  })

  it('injects wait and agent examples for generate + history', () => {
    const prompt = buildPlannerSystemPrompt({
      userInput: 'Article enhancer with History tab and run_history API.',
      intent: {
        task: 'Enhance articles and review past runs',
        audience: 'content editors',
        entities: [
          { name: 'article', kind: 'prose' },
          { name: 'run', kind: 'collection' },
        ],
        dataRequirements: [{ apiKey: 'run_history', usedFor: 'Past runs' }],
        actions: [{ id: 'enhance', purpose: 'Generate enhanced article', apiKey: 'enhance' }],
        workflowComplexity: 'long-running',
      },
      apiBindings: [
        { key: 'enhance', label: 'Enhance', kind: 'workflow', workflowId: 'wf-1' },
        { key: 'run_history', label: 'History', kind: 'workflow', workflowId: 'wf-2' },
      ],
    })
    expect(prompt).toContain('LONG-RUNNING: Use when the user asks')
    expect(prompt).toContain('COMPOSITION EXAMPLES (agent / history)')
    expect(prompt).toContain('second collection page, shell tabs')
    expect(prompt).toContain('SECONDARY PAGES only when')
  })

  it('injects workspace detail for multi-entity project management', () => {
    const prompt = buildPlannerSystemPrompt({
      userInput: 'Project management with tasks in a split view inspector.',
      intent: {
        task: 'Manage projects and tasks together',
        audience: 'PMs',
        entities: [
          { name: 'project', kind: 'collection' },
          { name: 'task', kind: 'collection' },
        ],
        dataRequirements: [],
        actions: [],
        workflowComplexity: 'short',
      },
    })
    expect(prompt).toContain('WORKSPACE REGIONS')
    expect(prompt).toContain('RELATIONSHIPS')
  })

  it('includeAll reconstitutes the full contract snapshot', () => {
    expect(buildPlannerSystemPrompt({ includeAll: true })).toBe(PLANNER_CONTRACT_PROMPT)
    expect(PLANNER_CONTRACT_PROMPT).toContain(PLANNER_CORE_PROMPT.slice(0, 40))
    expect(PLANNER_CONTRACT_PROMPT).toContain(PLANNER_ARCHETYPE_PROMPT.slice(0, 40))
    expect(PLANNER_CONTRACT_PROMPT).toContain(PLANNER_COMPOSITION_PROMPT.slice(0, 40))
    expect(PLANNER_CONTRACT_PROMPT).toContain(PLANNER_PACK_REMINDERS.slice(0, 40))
    expect(PLANNER_CONTRACT_PROMPT).toContain(PLANNER_CONSTRAINT_WAIT.slice(0, 40))
    expect(PLANNER_CONTRACT_PROMPT).toContain(PLANNER_COMPOSITION_EXAMPLES_AGENT.slice(0, 40))
  })
})

describe('resolvePlannerConstraintModules', () => {
  it('selects collection for a collection entity without wait', () => {
    const modules = resolvePlannerConstraintModules({
      userInput: 'Todo app',
      intent: {
        task: 'Todos',
        audience: 'individuals',
        entities: [{ name: 'todo', kind: 'collection' }],
        dataRequirements: [],
        actions: [],
        workflowComplexity: 'short',
      },
    })
    expect([...modules].sort()).toEqual(['collection'])
  })

  it('selects wait without agentExamples for long-running intent without History', () => {
    const modules = resolvePlannerConstraintModules({
      userInput: 'Analyze competitors',
      intent: {
        task: 'Competitor analysis',
        audience: 'analysts',
        entities: [{ name: 'report', kind: 'prose' }],
        dataRequirements: [],
        actions: [{ id: 'analyze', purpose: 'Run analysis' }],
        workflowComplexity: 'long-running',
      },
    })
    expect(modules.has('wait')).toBe(true)
    expect(modules.has('agentExamples')).toBe(false)
  })

  it('selects agentExamples when History is named', () => {
    const modules = resolvePlannerConstraintModules({
      userInput: 'Generator with a History tab',
      intent: {
        task: 'Generate and review past runs',
        audience: 'editors',
        entities: [{ name: 'run', kind: 'collection' }],
        dataRequirements: [],
        actions: [],
        workflowComplexity: 'long-running',
      },
    })
    expect(modules.has('wait')).toBe(true)
    expect(modules.has('agentExamples')).toBe(true)
    expect(modules.has('secondary')).toBe(true)
  })

  it('detects history from run_history binding keys alone', () => {
    expect(
      requestSignalsHistory({
        userInput: 'Article tool',
        apiBindings: [{ key: 'run_history', label: 'Runs', kind: 'workflow', workflowId: 'wf-1' }],
      })
    ).toBe(true)
  })

  it('detects wait from summarize / draft synonyms', () => {
    expect(requestSignalsWait({ userInput: 'Rewrite this policy draft' })).toBe(true)
    expect(requestSignalsWait({ userInput: 'Classify support tickets' })).toBe(true)
  })
})
