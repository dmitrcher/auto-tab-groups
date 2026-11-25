import { describe, expect, it } from "vitest"
import { preferredShortGroupTitle, titleCharacters } from "../utils/GroupTitles"

describe("preferredShortGroupTitle", () => {
  it.each([
    ["Habr", "Habr"],
    ["Mznn", "Mznn"],
    ["Github", "GH"],
    ["Documentation", "Docs"],
    ["Random-name-generator", "RNG"],
    ["Регистрация", "Рег"],
    ["📋 Обращение в ТНС", "📋 ТНС"],
    ["📱 Регистрация Free Max", "📱 FM"],
    ["👨‍👩‍👧‍👦 Xylophone", "👨‍👩‍👧‍👦 Xyl"]
  ])("shortens %s to %s", (full, short) => {
    expect(preferredShortGroupTitle(full)).toBe(short)
    expect(titleCharacters(short).length).toBeLessThanOrEqual(5)
  })
})
