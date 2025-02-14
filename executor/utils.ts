export function resolveEnvVariables(value: any, environmentVariables: Record<string, string>): any {
  if (typeof value === 'string') {
    const envMatches = value.match(/\{\{([^}]+)\}\}/g)
    if (envMatches) {
      let resolvedValue = value
      for (const match of envMatches) {
        const envKey = match.slice(2, -2)
        const envValue = environmentVariables[envKey]
        if (envValue === undefined) {
          throw new Error(`Environment variable "${envKey}" was not found.`)
        }
        resolvedValue = resolvedValue.replace(match, envValue)
      }
      return resolvedValue
    }
  } else if (Array.isArray(value)) {
    return value.map((item) => resolveEnvVariables(item, environmentVariables))
  } else if (value && typeof value === 'object') {
    return Object.entries(value).reduce(
      (acc, [k, v]) => ({ ...acc, [k]: resolveEnvVariables(v, environmentVariables) }),
      {}
    )
  }
  return value
}

export function resolveBlockReferences(
  value: string,
  blockById: Map<string, any>,
  blockByName: Map<string, any>,
  contextBlockStates: Map<string, any>,
  currentBlockTitle: string
): string {
  const blockMatches = value.match(/<([^>]+)>/g)
  let resolvedValue = value
  if (blockMatches) {
    for (const match of blockMatches) {
      const path = match.slice(1, -1)
      const [blockRef, ...pathParts] = path.split('.')
      let sourceBlock = blockById.get(blockRef)
      if (!sourceBlock) {
        const normalized = blockRef.toLowerCase().replace(/\s+/g, '')
        sourceBlock = blockByName.get(normalized)
      }
      if (!sourceBlock) {
        throw new Error(`Block reference "${blockRef}" was not found.`)
      }
      if (sourceBlock.enabled === false) {
        throw new Error(
          `Block "${sourceBlock.metadata?.title}" is disabled, and block "${currentBlockTitle}" depends on it.`
        )
      }
      const sourceState = contextBlockStates.get(sourceBlock.id)
      if (!sourceState) {
        throw new Error(
          `No state found for block "${sourceBlock.metadata?.title}" (ID: ${sourceBlock.id}).`
        )
      }
      // Drill into the property path.
      let replacementValue: any = sourceState
      for (const part of pathParts) {
        if (!replacementValue || typeof replacementValue !== 'object') {
          throw new Error(`Invalid path "${part}" in "${path}" for block "${currentBlockTitle}".`)
        }
        replacementValue = replacementValue[part]
      }
      if (replacementValue !== undefined) {
        resolvedValue = resolvedValue.replace(
          match,
          typeof replacementValue === 'object'
            ? JSON.stringify(replacementValue)
            : String(replacementValue)
        )
      } else {
        throw new Error(
          `No value found at path "${path}" in block "${sourceBlock.metadata?.title}".`
        )
      }
    }
  }
  return resolvedValue
}
