import { getColorInfo } from "../../utils/Constants"

type GroupEntry = {
  disclosure: HTMLDetailsElement
  title: HTMLSpanElement
  count: HTMLSpanElement
  tabs: HTMLUListElement
  tabSignature: string
}

const list = document.querySelector<HTMLDivElement>(".group-navigator-list")!
const empty = document.querySelector<HTMLParagraphElement>(".group-navigator-empty")!
const errorMessage = document.querySelector<HTMLParagraphElement>(".group-navigator-error")!
const entries = new Map<number, GroupEntry>()
let refreshTimer: ReturnType<typeof setTimeout>
let revision = 0

function scheduleRefresh(): void {
  const request = ++revision
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => void refresh(request), 40)
}

function createEntry(): GroupEntry {
  const disclosure = document.createElement("details")
  const summary = document.createElement("summary")
  const title = document.createElement("span")
  const count = document.createElement("span")
  const tabs = document.createElement("ul")
  title.className = "group-navigator-title"
  count.className = "group-navigator-count"
  summary.append(title, count)
  disclosure.append(summary, tabs)

  let previewing = false
  summary.addEventListener("pointerenter", event => {
    if (event.pointerType === "mouse" && !disclosure.open) {
      previewing = true
      disclosure.open = true
    }
  })
  disclosure.addEventListener("pointerleave", () => {
    if (previewing) {
      previewing = false
      disclosure.open = false
    }
  })
  summary.addEventListener("click", event => {
    if (previewing) {
      // Keep the preview open for keyboard navigation after an explicit click.
      event.preventDefault()
      previewing = false
    }
  })
  disclosure.addEventListener("keydown", event => {
    if (event.key === "Escape" && disclosure.open) {
      event.stopPropagation()
      previewing = false
      disclosure.open = false
      summary.focus()
    }
  })

  return { disclosure, title, count, tabs, tabSignature: "" }
}

function updateTabs(entry: GroupEntry, tabs: chrome.tabs.Tab[]): void {
  const signature = JSON.stringify(tabs.map(tab => [tab.id, tab.title, tab.url]))
  if (entry.tabSignature === signature) return
  entry.tabSignature = signature

  const rows = document.createDocumentFragment()
  for (const tab of tabs) {
    const tabId = tab.id
    if (tabId === undefined) continue
    const row = document.createElement("li")
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = tab.title || tab.url || "…"
    button.title = tab.url || button.textContent
    button.addEventListener("click", async () => {
      try {
        await browser.tabs.update(tabId, { active: true })
      } catch {
        // The tab may have closed between rendering and clicking.
        scheduleRefresh()
      }
    })
    row.append(button)
    rows.append(row)
  }
  entry.tabs.replaceChildren(rows)
}

async function refresh(request: number): Promise<void> {
  try {
    const { id: windowId } = await browser.windows.getCurrent()
    if (windowId === undefined) return
    const [groups, tabs] = await Promise.all([
      browser.tabGroups.query({ windowId }),
      browser.tabs.query({ windowId })
    ])
    if (request !== revision) return

    const tabsByGroup = new Map<number, chrome.tabs.Tab[]>()
    for (const tab of tabs.sort((a, b) => a.index - b.index)) {
      if (tab.groupId < 0) continue
      const members = tabsByGroup.get(tab.groupId)
      if (members) members.push(tab)
      else tabsByGroup.set(tab.groupId, [tab])
    }

    const currentGroups = new Map(groups.map(group => [group.id, group]))
    for (const [id, entry] of entries) {
      if (currentGroups.has(id) && tabsByGroup.has(id)) continue
      entry.disclosure.remove()
      entries.delete(id)
    }

    let index = 0
    for (const [id, members] of tabsByGroup) {
      const group = currentGroups.get(id)
      if (!group) continue
      const entry = entries.get(id) ?? createEntry()
      entries.set(id, entry)
      const title = group.title?.trim() || members[0].title || members[0].url || "…"
      if (entry.title.textContent !== title) entry.title.textContent = title
      const count = String(members.length)
      if (entry.count.textContent !== count) entry.count.textContent = count
      entry.disclosure.style.setProperty(
        "--tab-group-color",
        getColorInfo(group.color)?.hex ?? "#9e9e9e"
      )
      updateTabs(entry, members)
      const current = list.children[index++]
      if (current !== entry.disclosure) list.insertBefore(entry.disclosure, current ?? null)
    }

    errorMessage.hidden = true
    empty.hidden = entries.size > 0
  } catch (error) {
    if (request !== revision) return
    console.error("Could not load tab groups:", error)
    errorMessage.hidden = false
    empty.hidden = true
  }
}

browser.tabGroups.onCreated.addListener(scheduleRefresh)
browser.tabGroups.onRemoved.addListener(scheduleRefresh)
browser.tabGroups.onUpdated.addListener(scheduleRefresh)
browser.tabGroups.onMoved?.addListener(scheduleRefresh)
browser.tabs.onCreated.addListener(scheduleRefresh)
browser.tabs.onUpdated.addListener(scheduleRefresh)
browser.tabs.onRemoved.addListener(scheduleRefresh)
browser.tabs.onMoved.addListener(scheduleRefresh)
browser.tabs.onAttached.addListener(scheduleRefresh)
browser.tabs.onDetached.addListener(scheduleRefresh)
scheduleRefresh()
