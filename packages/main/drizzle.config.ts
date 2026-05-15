import type { Config } from 'drizzle-kit'

export default {
  dialect: 'sqlite',
  schema: './src/storage/schema.ts',
  out: './drizzle',
  strict: true,
  dbCredentials: {
    url: './drizzle/dev.db',
  },
} satisfies Config
