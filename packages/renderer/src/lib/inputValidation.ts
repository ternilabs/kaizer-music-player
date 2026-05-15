import { z } from 'zod/v4'

const HTTP_URL_PROTOCOL_REGEX = /^https?:\/\//i
const DATA_IMAGE_URL_REGEX = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i

export const FILTER_TEXT_MAX_LENGTH = 180
export const PLAYLIST_NAME_MAX_LENGTH = 120
export const STORAGE_CAPACITY_MAX_MB = 999_999
export const STORAGE_CAPACITY_WARNING_HEADROOM_MB = 100

function sanitizeSingleLineText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  let sanitizedValue = ''

  for (const character of value) {
    const characterCode = character.charCodeAt(0)
    if ((characterCode >= 0 && characterCode <= 31) || characterCode === 127) {
      continue
    }

    sanitizedValue += character
  }

  return sanitizedValue
}

function isAcceptedImageValue(value: string): boolean {
  if (!value) {
    return true
  }

  if (DATA_IMAGE_URL_REGEX.test(value)) {
    return true
  }

  if (!HTTP_URL_PROTOCOL_REGEX.test(value)) {
    return false
  }

  return z.url().safeParse(value).success
}

const singleLineTextSchema = z.preprocess(sanitizeSingleLineText, z.string())

export const filterTextInputSchema = singleLineTextSchema.transform((value) =>
  value.slice(0, FILTER_TEXT_MAX_LENGTH))

export const searchQueryDraftSchema = singleLineTextSchema.pipe(
  z.string().max(FILTER_TEXT_MAX_LENGTH, {
    error: `Search query must be ${FILTER_TEXT_MAX_LENGTH} characters or fewer.`,
  }),
)

export const searchQueryRouteSchema = filterTextInputSchema

export const submittedSearchQueryRouteSchema = filterTextInputSchema.transform((value) => value.trim())

export const searchQuerySubmitSchema = singleLineTextSchema
  .transform((value) => value.trim())
  .pipe(z.string()
    .min(1, { error: 'Enter a search query.' })
    .max(FILTER_TEXT_MAX_LENGTH, {
      error: `Search query must be ${FILTER_TEXT_MAX_LENGTH} characters or fewer.`,
    }))

export const playlistNameSchema = singleLineTextSchema
  .transform((value) => value.trim())
  .pipe(z.string()
    .min(1, { error: 'Enter a playlist name.' })
    .max(PLAYLIST_NAME_MAX_LENGTH, {
      error: `Playlist name must be ${PLAYLIST_NAME_MAX_LENGTH} characters or fewer.`,
    }))

export const optionalPlaylistCoverSchema = singleLineTextSchema
  .transform((value) => value.trim())
  .superRefine((value, context) => {
    if (isAcceptedImageValue(value)) {
      return
    }

    context.addIssue({
      code: 'custom',
      message: 'Enter a valid HTTP(S) image URL.',
    })
  })
  .transform((value) => value || undefined)

export function createStorageCapacityInputSchema(minRequiredMb: number) {
  const normalizedMinRequiredMb = Math.max(1, Math.ceil(minRequiredMb))

  return singleLineTextSchema
    .transform((value) => value.trim())
    .pipe(z.string()
      .min(1, { error: 'Enter a storage capacity.' })
      .regex(/^\d+$/, { error: 'Enter a whole number in MB.' })
      .transform((value) => Number(value))
      .pipe(z.number()
        .int({ error: 'Enter a whole number in MB.' })
        .positive({ error: 'Enter a value greater than 0.' })
        .min(normalizedMinRequiredMb, {
          error: `Storage capacity cannot be lower than the current used storage (${normalizedMinRequiredMb} MB).`,
        })
        .max(STORAGE_CAPACITY_MAX_MB, {
          error: `Enter a value below ${STORAGE_CAPACITY_MAX_MB + 1} MB.`,
        })))
}

export function getStorageCapacityHeadroomWarning(valueMb: number, usedStorageMb: number): string {
  const normalizedUsedStorageMb = Math.max(0, Math.ceil(usedStorageMb))
  const remainingHeadroomMb = Math.max(0, valueMb - normalizedUsedStorageMb)

  if (remainingHeadroomMb >= STORAGE_CAPACITY_WARNING_HEADROOM_MB) {
    return ''
  }

  return `Only ${remainingHeadroomMb} MB will remain for future local downloads. Increase the limit to avoid download failures.`
}

export function getFirstValidationIssue(error: { issues: Array<{ message?: string }> }): string {
  return error.issues[0]?.message || 'Invalid input.'
}

export function normalizeFilterTextInput(value: unknown): string {
  return filterTextInputSchema.parse(value)
}

export function normalizeSingleLineTextInput(value: unknown): string {
  return singleLineTextSchema.parse(value)
}
