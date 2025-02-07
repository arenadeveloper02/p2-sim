// Helper function to get the next block number for a given type
export const getNextBlockNumber = (blocks: Record<string, any>, type: string) => {
  const typeBlocks = Object.values(blocks)
    .filter((block: any) => block.type.toLowerCase() === type.toLowerCase())
    .map((block: any) => {
      const match = block.name.match(new RegExp(`${type}\\s*(\\d+)`, 'i'))
      return match ? parseInt(match[1]) : 0
    })

  const maxNumber = Math.max(0, ...typeBlocks)
  return maxNumber + 1
}