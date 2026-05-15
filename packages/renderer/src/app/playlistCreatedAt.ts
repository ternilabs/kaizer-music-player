export function formatPlaylistCreatedAt(createdAt: string): string {
  const normalizedValue = createdAt.trim()
  if (!normalizedValue) {
    return 'Created recently'
  }

  const createdAtDate = new Date(normalizedValue)
  if (Number.isNaN(createdAtDate.getTime())) {
    return normalizedValue
  }

  const now = new Date()
  const diffMs = now.getTime() - createdAtDate.getTime()
  const safeDiffMs = Math.max(0, diffMs)
  const diffMinutes = Math.floor(safeDiffMs / (1000 * 60))

  if (diffMinutes < 1) {
    return 'Created just now'
  }

  if (diffMinutes < 60) {
    return `Created ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `Created ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }

  if (diffHours < 48) {
    return 'Created yesterday'
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return `Created ${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  }

  return `Created at ${createdAtDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`
}
