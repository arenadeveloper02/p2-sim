/**
 * Per-catalog-type behavior defaults. The compiler and renderer read these;
 * the LLM does not emit them.
 */
export const UX_DEFAULTS = {
  Button: {
    disabledWhileLoading: true,
    preventDoubleSubmit: true,
    focusState: true,
    pressScale: true,
    confirmIfDestructive: true,
  },
  SubmitButton: {
    disabledWhileLoading: true,
    preventDoubleSubmit: true,
    focusState: true,
    pressScale: true,
  },
  Form: {
    validateBeforeSubmit: true,
    showInlineErrors: true,
    requiredIndication: true,
    disableSubmitWhileSubmitting: true,
  },
  Table: {
    loadingState: 'skeleton' as const,
    emptyState: true,
    errorState: true,
    retry: true,
  },
  Repeat: {
    loadingState: 'skeleton' as const,
    emptyState: true,
    errorState: true,
    retry: true,
  },
  Stat: { loadingState: 'skeleton' as const },
  KeyValue: { loadingState: 'skeleton' as const, emptyState: true },
  DataText: { loadingState: 'skeleton' as const },
  SearchField: {
    disabledWhileLoading: true,
    preventDoubleSubmit: true,
  },
  Image: { fallback: true, lazyLoad: true },
  Tabs: { activeFromRoute: true },
} as const
