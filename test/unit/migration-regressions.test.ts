import { expect, test } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, linkSync, symlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseTaskDocument } from "../../src/task-parser.js"
import { createOpenSpecStatusGateway } from "../../src/openspec-status.js"
import { readContainedTaskFile } from "../../src/refresh-coordinator.js"
import { processCommand } from "../../src/openspec-process.js"
import { isValidChangeName } from "../../src/change-name.js"
import { selectOpenSpecCandidate } from "../../src/openspec-list.js"

// Windows rejects file symlinks without Developer Mode or elevation.
const canSymlink = (() => {
 const root = mkdtempSync(join(tmpdir(), "angel-symlink-probe-"))
 try { writeFileSync(join(root, "target"), ""); symlinkSync(join(root, "target"), join(root, "link")); return true }
 catch { return false }
 finally { rmSync(root, { recursive: true, force: true }) }
})()

test("task discovery handles early changes and ignores hidden checkboxes", () => {
 expect(isValidChangeName("2fa-login")).toBe(true)
 expect(isValidChangeName("Plan_V2")).toBe(true)
 expect(isValidChangeName("../outside")).toBe(false)
 expect(selectOpenSpecCandidate({ changes: [{ name: "2fa-login", status: "no-tasks", lastModified: "2026-01-01T00:00:00Z" }] })).toEqual({ status: "selected", changeName: "2fa-login" })
 expect(parseTaskDocument("- [ ] document `<!--` and ``a`<!--``\n- [x] next").progress).toEqual({ total: 2, completed: 1 })
 expect(parseTaskDocument("<!--\n- [ ] hidden\n-->\n- [x] visible").progress).toEqual({ total: 1, completed: 1 })
})


test("unclosed inline comments stay literal while comment blocks hide lines", () => {
 expect(parseTaskDocument("- note: `<!-- always\n- [x] should survive").progress).toEqual({ total: 1, completed: 1 })
 expect(parseTaskDocument("- [ ] a <!-- open\n- [x] b").progress).toEqual({ total: 2, completed: 1 })
 expect(parseTaskDocument("- [ ] a <!-- note --> b").sections[0]?.tasks[0]?.label).toBe("a  b")
 expect(parseTaskDocument("`start\n<!-- marker\n- [x] inside\nend`\n- [x] after").progress).toEqual({ total: 0, completed: 0 })
 expect(parseTaskDocument("- [ ] a\n  <!--\n  - [ ] hidden\n  -->\n- [x] c").progress).toEqual({ total: 2, completed: 1 })
 expect(parseTaskDocument("<!-- one line --> - [ ] not a task\n- [x] task").progress).toEqual({ total: 1, completed: 1 })
})


test.skipIf(!canSymlink)("status gateway rejects a task symlink outside the planning root", async () => {
 const root = mkdtempSync(join(tmpdir(), "angel-status-"))
 try {
  const planning = join(root, "planning"), changes = join(planning, "changes"), change = join(changes, "demo"), task = join(change, "tasks.md")
  mkdirSync(change, { recursive: true }); writeFileSync(join(root, "private.md"), "private"); symlinkSync(join(root, "private.md"), task)
  const status = { changeName: "demo", changeRoot: change, planningHome: { root: planning, changesDir: changes }, artifactPaths: { tasks: { resolvedOutputPath: task } } }
  const gateway = createOpenSpecStatusGateway(async () => ({ stdout: JSON.stringify(status), stderr: "" }))
  expect(await gateway.resolve("demo", root)).toEqual({ status: "temporary-failure", reason: "unsafe-path" })
 } finally { rmSync(root, { recursive: true, force: true }) }
})


test("Windows OpenSpec launcher invokes the npm shim without accepting shell syntax", () => {
 const request = { command: "openspec", args: ["status", "--change", "2fa-login", "--json"], cwd: ".", timeoutMs: 100, maxOutputBytes: 100 }
 expect(processCommand(request, "win32", () => "C:\\Trusted Tools\\openspec.cmd").args).toEqual(["/d", "/s", "/c", '""C:\\Trusted Tools\\openspec.cmd" status --change 2fa-login --json"'])
 expect(() => processCommand({ ...request, args: ["status", "x&calc"] }, "win32", () => "C:\\Trusted Tools\\openspec.cmd")).toThrow(/Unsafe OpenSpec Windows arguments/)
 expect(processCommand(request, "win32", () => "C:\\R&D (x86)^1\\openspec.cmd").args.at(-1)).toBe('""C:\\R&D (x86)^1\\openspec.cmd" status --change 2fa-login --json"')
 for (const shim of ["C:\\%PATH%\\openspec.cmd", "C:\\a!b\\openspec.cmd", "C:\\a\"b\\openspec.cmd", "relative\\openspec.cmd"]) {
  expect(() => processCommand(request, "win32", () => shim)).toThrow(/Unsafe OpenSpec shim path/)
 }
})


 test.skipIf(!canSymlink)("task reads revalidate paths that were missing during status resolution", async () => {
  const root = mkdtempSync(join(tmpdir(), "angel-task-read-"))
  try {
   const change = join(root, "change"), task = join(change, "tasks.md")
   mkdirSync(change); writeFileSync(join(root, "private.md"), "private")
   symlinkSync(join(root, "private.md"), task)
   await expect(readContainedTaskFile(task, change)).rejects.toThrow()
   rmSync(task); linkSync(join(root, "private.md"), task)
   await expect(readContainedTaskFile(task, change)).rejects.toThrow()
   rmSync(task); writeFileSync(task, "- [ ] safe")
   expect(await readContainedTaskFile(task, change)).toBe("- [ ] safe")
  } finally { rmSync(root, { recursive: true, force: true }) }
 })
