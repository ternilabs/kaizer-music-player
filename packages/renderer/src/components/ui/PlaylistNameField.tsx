interface PlaylistNameFieldProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
}

export function PlaylistNameField({
  label = 'Playlist name',
  placeholder = 'My playlist',
  value,
  onChange,
  error,
}: PlaylistNameFieldProps) {
  return (
    <label className="block text-sm text-zinc-200">
      {label}
      <input
        aria-invalid={error ? true : undefined}
        className={`ui-input-field mt-1 ${error ? 'border-rose-500/50 bg-rose-500/5 text-rose-100 placeholder:text-rose-200/60 focus-visible:ring-rose-400' : ''}`}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      {error ? (
        <span className="mt-1 block text-xs text-rose-300">{error}</span>
      ) : null}
    </label>
  )
}
