const INDEX_PREFIX_PATTERN = /^\d+\. /
export const COMPACT_TITLE_LIMIT = 5
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

const abbreviations = new Map([
  ["account", "Acct"],
  ["application", "App"],
  ["documentation", "Docs"],
  ["github", "GH"],
  ["registration", "Reg"],
  ["system", "Sys"],
  ["документы", "Док"],
  ["обращение", "Обр"],
  ["регистрация", "Рег"],
  ["система", "Сист"],
  ["уведомления", "Увед"]
])

const connectingWords = new Set([
  "a",
  "and",
  "for",
  "in",
  "of",
  "the",
  "to",
  "registration",
  "в",
  "для",
  "и",
  "из",
  "к",
  "на",
  "по",
  "с",
  "обращение",
  "регистрация"
])

export function stripIndexPrefix(title: string): string {
  return title.replace(INDEX_PREFIX_PATTERN, "")
}

export function titleCharacters(title: string): string[] {
  return Array.from(segmenter.segment(title), part => part.segment)
}

export function preferredShortGroupTitle(title: string): string {
  const parts = titleCharacters(title.trim())
  if (parts.length <= COMPACT_TITLE_LIMIT) return parts.join("")

  const known = abbreviations.get(title.trim().toLowerCase())
  if (known) return known

  const words = title.match(/\p{L}[\p{L}\p{M}\p{N}]*/gu) ?? []
  const significant = words.filter(word => !connectingWords.has(word.toLowerCase()))
  const acronym = [...significant].reverse().find(word => /^[\p{Lu}\p{N}]{2,5}$/u.test(word))
  const initials =
    significant.length > 1
      ? significant
          .map(word => titleCharacters(word)[0])
          .join("")
          .toUpperCase()
      : undefined
  const first = parts[0]
  const emoji = /\p{Extended_Pictographic}/u.test(first) ? first : ""
  const abbreviation = acronym ?? initials
  if (abbreviation) {
    const marked = emoji ? `${emoji} ${abbreviation}` : abbreviation
    if (titleCharacters(marked).length <= COMPACT_TITLE_LIMIT) return marked
    if (titleCharacters(abbreviation).length <= COMPACT_TITLE_LIMIT) return abbreviation
  }
  return parts.slice(0, COMPACT_TITLE_LIMIT).join("").trimEnd()
}
