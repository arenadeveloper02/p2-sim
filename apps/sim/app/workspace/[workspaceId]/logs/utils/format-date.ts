export function formatDate(date: string | Date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  // Relative time
  let relative: string
  if (diffMins < 1) {
    relative = 'Just now'
  } else if (diffMins < 60) {
    relative = `${diffMins}m ago`
  } else if (diffHours < 24) {
    relative = `${diffHours}h ago`
  } else if (diffDays < 7) {
    relative = `${diffDays}d ago`
  } else {
    relative = `${month}/${day}/${year}`
  }

  return {
    full: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
    compactDate: `${month}/${day}`,
    compactTime: `${hours}:${minutes}`,
    relative,
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
  }
}
