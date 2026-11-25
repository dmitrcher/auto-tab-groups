import type { Browser } from "wxt/browser"
import {
  COMPACT_TITLE_LIMIT,
  preferredShortGroupTitle,
  stripIndexPrefix,
  titleCharacters
} from "../utils/GroupTitles"
import { withTabEditRetry } from "../utils/withTabEditRetry"

const STORAGE_KEY = "compactGroupTitles"
type Group = Browser.tabGroups.TabGroup
type SavedTitles = {
  enabled: boolean
  aliases: [string, string][]
}

class CompactGroupTitles {
  enabled = false
  private aliases = new Map<string, string>()
  private originals = new Map<string, string>()
  private reserved = new Set<string>()
  private dirty = false
  private pending = Promise.resolve()

  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task)
    this.pending = result.then(
      () => {},
      () => {}
    )
    return result
  }

  async initialize(): Promise<void> {
    const data = await browser.storage.local.get(STORAGE_KEY)
    const saved = data[STORAGE_KEY] as SavedTitles | undefined
    for (const [title, alias] of saved?.aliases ?? []) {
      this.remember(title, alias)
    }
    this.dirty = false
    if (saved?.enabled || this.aliases.size > 0) await this.setEnabled(Boolean(saved?.enabled))
  }

  fullTitle(title: string): string {
    const unnumbered = stripIndexPrefix(title)
    return this.originals.get(unnumbered) ?? unnumbered
  }

  private remember(title: string, alias: string): void {
    this.aliases.set(title, alias)
    this.originals.set(alias, title)
    this.reserved.add(alias.toLowerCase())
    this.dirty = true
  }

  private assign(title: string): string {
    const saved = this.aliases.get(title)
    if (saved !== undefined) return saved
    let alias = preferredShortGroupTitle(title)
    const parts = titleCharacters(alias)
    for (let counter = 2; this.reserved.has(alias.toLowerCase()); counter++) {
      const suffix = counter.toString(36)
      alias =
        parts
          .slice(0, COMPACT_TITLE_LIMIT - suffix.length)
          .join("")
          .trimEnd() + suffix
    }
    this.remember(title, alias)
    return alias
  }

  private async save(): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEY]: { enabled: this.enabled, aliases: [...this.aliases] }
    })
    this.dirty = false
  }

  async displayTitle(title: string): Promise<string> {
    if (!this.enabled || !title.trim()) return title
    return this.run(async () => {
      if (!this.enabled) return title
      const alias = this.assign(title)
      if (this.dirty) await this.save()
      return alias
    })
  }

  async setEnabled(enabled: boolean): Promise<number> {
    return this.run(async () => {
      const groups = await browser.tabGroups.query({})
      const previous = this.enabled
      this.enabled = enabled

      if (enabled) {
        const titles = [...new Set(groups.map(group => this.fullTitle(group.title ?? "")))]
          .filter(title => title.trim())
          .sort((a, b) => titleCharacters(a).length - titleCharacters(b).length)
        for (const title of titles) this.assign(title)
      }
      try {
        await this.save()
      } catch (error) {
        this.enabled = previous
        throw error
      }

      let failed = 0
      for (const group of groups) {
        const current = group.title ?? ""
        const full = this.fullTitle(current)
        const target = enabled ? this.aliases.get(full) : this.originals.get(current)
        if (!target || target === current) continue
        try {
          await this.renameIfUnchanged(group.id, current, target)
        } catch {
          failed++
        }
      }
      if (!enabled && failed === 0) {
        this.aliases.clear()
        this.originals.clear()
        this.reserved.clear()
        await this.save()
      }
      return failed
    })
  }

  async updateGroup(group: Group): Promise<void> {
    const current = group.title ?? ""
    if (!this.enabled || !current.trim() || this.originals.has(current)) return

    await this.run(async () => {
      if (!this.enabled) return
      const full = this.fullTitle(current)
      const target = this.assign(full)
      if (this.dirty) await this.save()
      if (target !== current) await this.renameIfUnchanged(group.id, current, target)
    })
  }

  private async renameIfUnchanged(id: number, before: string, title: string): Promise<void> {
    const latest = await browser.tabGroups.get(id)
    if (latest.title === before) {
      await withTabEditRetry(() => browser.tabGroups.update(id, { title }))
    }
  }
}

export const compactGroupTitles = new CompactGroupTitles()
