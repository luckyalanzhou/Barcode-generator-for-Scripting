const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { createRequire } = require("node:module")
const { test } = require("node:test")

const root = path.resolve(__dirname, "..")
const projectRequire = createRequire(path.join(root, "package.json"))
// Reuse the CLI's existing parser without installing dependencies or emitting files.
const ts = createRequire(projectRequire.resolve("scripting-cli"))("typescript")
const normalize = (value) => path.posix.normalize(value)
const plain = (value) => JSON.parse(JSON.stringify(value))
const favorite = (patch = {}) => ({ id: "one", name: "示例", texts: ["123"], type: "code128", time: 1, folder: "工作/客户", ...patch })

function extractCallback(relativePath, name, bindings) {
  const filename = path.resolve(root, relativePath)
  const sourceFile = ts.createSourceFile(relativePath, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let source
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) source = node.getText(sourceFile)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(source, `${relativePath}:${name}`)
  const code = ts.transpileModule(`${source}\nglobalThis.subject = ${name}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
  const context = vm.createContext({ ...sandbox().validation, ...bindings })
  vm.runInContext(code, context, { filename })
  return context.subject
}

function sandbox(initialValues = [], runtimeGlobals = {}, initialFiles = []) {
  const files = new Map()
  const directories = new Set()
  for (const [filename, text] of initialFiles) files.set(normalize(filename), text)
  const values = new Map(initialValues)
  const mutations = []
  const messages = []
  const key = (name, options) => `${options?.shared ? "shared" : "local"}:${name}`
  const Storage = {
    get: (name, options) => values.get(key(name, options)),
    contains: (name, options) => values.has(key(name, options)),
    set: (name, value, options) => { mutations.push(["storage", name]); values.set(key(name, options), value) },
    remove: (name, options) => { mutations.push(["removeStorage", name]); values.delete(key(name, options)) },
  }
  const FileManager = {
    isiCloudEnabled: true,
    iCloudDocumentsDirectory: "/mock/icloud",
    appGroupDocumentsDirectory: "/mock/group",
    documentsDirectory: "/mock/documents",
    scriptsDirectory: "/mock/scripts",
    temporaryDirectory: "/mock/tmp",
    existsSync: (value) => files.has(normalize(value)) || directories.has(normalize(value)),
    isFileSync: (value) => files.has(normalize(value)),
    isDirectorySync: (value) => directories.has(normalize(value)),
    readAsStringSync: (value) => { assert.ok(files.has(normalize(value)), `Missing virtual file: ${value}`); return files.get(normalize(value)) },
    readDirectorySync: (value) => [...directories, ...files.keys()].filter((entry) => entry.startsWith(`${normalize(value)}/`)),
    createDirectorySync: (value) => { mutations.push(["mkdir", normalize(value)]); directories.add(normalize(value)) },
    writeAsStringSync: (value, text) => { mutations.push(["write", normalize(value)]); files.set(normalize(value), text) },
    removeSync: (value) => {
      mutations.push(["remove", normalize(value)])
      for (const entry of [...files.keys()]) if (entry === normalize(value) || entry.startsWith(`${normalize(value)}/`)) files.delete(entry)
      for (const entry of [...directories]) if (entry === normalize(value) || entry.startsWith(`${normalize(value)}/`)) directories.delete(entry)
    },
  }
  const cache = new Map()
  function load(relative) {
    const filename = path.resolve(root, relative)
    if (cache.has(filename)) return cache.get(filename)
    const exports = {}
    cache.set(filename, exports)
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText
    vm.runInNewContext(code, {
      ...runtimeGlobals, exports, Storage, FileManager,
      require: (specifier) => {
        if (specifier === "scripting") return runtimeGlobals.scripting ?? {}
        assert.ok(specifier.startsWith("."), `Unexpected dependency: ${specifier}`)
        const stem = path.resolve(path.dirname(filename), specifier)
        const dependency = [stem, `${stem}.ts`, `${stem}.tsx`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
        assert.ok(dependency, specifier)
        return load(path.relative(root, dependency))
      },
    }, { filename })
    return exports
  }
  const storage = load("src/storage.ts")
  const validation = load("src/validation.ts")
  const core = load("src/barcode_core.tsx")
  const index = ts.createSourceFile("index.tsx", fs.readFileSync(path.join(root, "index.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function findFunction(name) {
    let found
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(index)
      ts.forEachChild(node, visit)
    }
    visit(index)
    return found
  }
  function callback(name, bindings) {
    const source = findFunction(name)
    assert.ok(source, name)
    const helpers = ["checkFolderPaths", "favoriteListsMatch", "favoritesPersisted", "folderPathsPersisted", "restoreFolderState"]
      .map(findFunction).filter(Boolean).join("\n")
    const code = ts.transpileModule(`${helpers}\n${source}\nglobalThis.subject = ${name}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText
    const context = vm.createContext({
      ...storage, ...validation, FileManager, Storage,
      alert: async (message) => messages.push(message),
      Dialog: { alert: async (message) => messages.push(message), confirm: async () => false },
      ...bindings,
    })
    vm.runInContext(code, context)
    return context.subject
  }
  return { files, directories, values, mutations, messages, FileManager, storage, validation, core, callback }
}

test("GitHub Actions pins every external action to a full commit SHA", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/test.yml"), "utf8")
  const actions = [...workflow.matchAll(/^\s*-\s*uses:\s*([^\s#]+)(?:\s+#\s*(v[^\r\n]+))?\s*$/gm)]

  assert.deepEqual(actions.map(([, reference]) => reference.split("@")[0]).sort(), [
    "actions/checkout",
    "actions/setup-node",
    "pnpm/action-setup",
  ])
  for (const [, reference, version] of actions) {
    assert.match(reference, /^[^@]+@[0-9a-f]{40}$/i)
    assert.ok(/^v\d+\.\d+\.\d+$/.test(version ?? ""), `missing release comment for ${reference}`)
  }
})

test("history and favorite timestamps share centralized formatting", () => {
  const now = new Date(2025, 4, 6, 15, 30).getTime()
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])) }
  }
  const historySource = fs.readFileSync(path.join(root, "src/pages/HistoryPage.tsx"), "utf8")
  const favoritesSource = fs.readFileSync(path.join(root, "src/pages/FavoritesPage.tsx"), "utf8")
  const barcodesSource = fs.readFileSync(path.join(root, "src/pages/BarcodesPage.tsx"), "utf8")
  const formatHistoryTime = extractCallback("src/pages/BarcodesPage.tsx", "formatHistoryTime", { exports: {}, Date: FixedDate })
  const formatFavoriteTime = extractCallback("src/pages/BarcodesPage.tsx", "formatFavoriteTime", { exports: {}, Date: FixedDate, formatHistoryTime })

  assert.ok(/export function formatHistoryTime/.test(barcodesSource), "BarcodesPage exports the shared history formatter")
  assert.ok(/export function formatFavoriteTime/.test(barcodesSource), "BarcodesPage exports the shared favorite formatter")
  assert.ok(/import \{[^}]*formatHistoryTime[^}]*\} from "\.\/BarcodesPage"/.test(historySource), "HistoryPage imports the shared formatter")
  assert.ok(/import \{[^}]*formatFavoriteTime[^}]*\} from "\.\/BarcodesPage"/.test(favoritesSource), "FavoritesPage imports the shared formatter")
  assert.ok(!/function formatHistoryTime/.test(historySource), "HistoryPage does not duplicate timestamp formatting")
  assert.ok(!/function formatFavoriteTime/.test(favoritesSource), "FavoritesPage does not duplicate timestamp formatting")

  const sameDay = new Date(2025, 4, 6, 8, 9).getTime()
  const priorDay = new Date(2025, 4, 5, 8, 9).getTime()
  assert.equal(formatHistoryTime(sameDay), "08:09")
  assert.equal(formatHistoryTime(priorDay), "5/5 08:09")
  assert.equal(formatFavoriteTime(sameDay), "08:09")
  assert.equal(formatFavoriteTime(priorDay), "5/5 08:09")
  assert.equal(formatFavoriteTime(undefined), "")
  assert.equal(formatFavoriteTime(Number.NaN), "")
})

test("reject a favorite escaping into folders.json before any write", () => {
  const env = sandbox()
  const target = "/mock/icloud/BarcodeGenerator/folders.json"
  env.files.set(target, '["保留"]')
  assert.throws(() => env.storage.saveFavorites([favorite({ id: "folders", folder: ".." })]), /文件夹/)
  assert.equal(env.files.get(target), '["保留"]')
  assert.equal(env.mutations.length, 0)
})

test("preflight a mixed batch without writing or deleting existing records", () => {
  const env = sandbox()
  const target = "/mock/icloud/BarcodeGenerator/favorites/keep.json"
  env.files.set(target, JSON.stringify(favorite({ id: "keep", folder: "" })))
  assert.throws(() => env.storage.saveFavorites([favorite(), favorite({ folder: "A/../B" })]), /文件夹/)
  assert.equal(env.files.has(target), true)
  assert.equal(env.mutations.length, 0)
})

test("reject dangerous folder records before persistence", () => {
  for (const folder of [".", "..", "A/../B", "A/ ./B", "/absolute", "A\\..\\B", "A/\u0000B"]) {
    const env = sandbox()
    assert.throws(() => env.storage.saveFolders(["保留", folder]), /文件夹/, JSON.stringify(folder))
    assert.equal(env.mutations.length, 0)
  }
})

test("validate all raw path segments without adding naming or depth limits", () => {
  const env = sandbox()
  for (const folder of ["", "中文/客户", "A/B/C", "A".repeat(51), "A:B", "A%2FB"]) {
    assert.equal(env.validation.validateFolderPath(folder), null, folder)
  }
  for (const folder of ["A/B/../escape", " A / .. /B", "A/\nB", "\\absolute"]) {
    assert.ok(env.validation.validateFolderPath(folder), JSON.stringify(folder))
  }
})

test("preserve valid names, uncategorized favorites, IDs and backup shape", () => {
  const env = sandbox()
  const items = [favorite(), favorite({ id: "two", folder: "" })]
  env.storage.saveFolders(["工作", "工作/客户"])
  env.storage.saveFavorites(items)
  assert.deepEqual(plain(env.storage.loadFavorites()), items)
  assert.deepEqual(plain(env.storage.loadFolders()), ["工作", "工作/客户"])
  const stored = JSON.parse(env.files.get("/mock/icloud/BarcodeGenerator/favorites/工作/客户/one.json"))
  assert.deepEqual(stored, items[0])
})

test("folders.json remains the fallback when Storage has no folder list", () => {
  const env = sandbox()
  env.files.set("/mock/icloud/BarcodeGenerator/folders.json", JSON.stringify(["工作", "工作/客户"]))

  assert.deepEqual(plain(env.storage.loadFolders()), ["工作", "工作/客户"])
})

test("startup migration preserves a valid external folder index over stale local Storage", () => {
  const folderIndex = "/mock/icloud/BarcodeGenerator/folders.json"
  const externalFolders = ["新文件夹", "新文件夹/子目录"]
  const env = sandbox(
    [["local:favorite_folders", ["旧文件夹"]]],
    {},
    [[folderIndex, JSON.stringify(externalFolders)]],
  )

  assert.deepEqual(plain(env.storage.loadFolders()), externalFolders)
  assert.deepEqual(JSON.parse(env.files.get(folderIndex)), externalFolders)
})

test("startup migration preserves an explicitly empty external folder index", () => {
  const folderIndex = "/mock/icloud/BarcodeGenerator/folders.json"
  const env = sandbox(
    [["local:favorite_folders", ["旧文件夹"]]],
    {},
    [[folderIndex, "[]"]],
  )

  assert.deepEqual(plain(env.storage.loadFolders()), [])
  assert.equal(env.files.get(folderIndex), "[]")
})

test("startup migration recovers an unreadable external folder index from local Storage", () => {
  const folderIndex = "/mock/icloud/BarcodeGenerator/folders.json"
  const env = sandbox(
    [["local:favorite_folders", ["旧文件夹"]]],
    {},
    [[folderIndex, "{invalid JSON"]],
  )

  assert.deepEqual(plain(env.storage.loadFolders()), ["旧文件夹"])
  assert.deepEqual(JSON.parse(env.files.get(folderIndex)), ["旧文件夹"])
})

test("startup migration leaves the external folder index untouched when shared Storage exists", () => {
  const folderIndex = "/mock/icloud/BarcodeGenerator/folders.json"
  const env = sandbox(
    [["local:favorite_folders", ["旧文件夹"]], ["shared:favorite_folders", ["共享目录"]]],
    {},
    [[folderIndex, JSON.stringify(["文件索引目录"])]],
  )

  assert.deepEqual(plain(env.storage.loadFolders()), ["文件索引目录"])
  assert.deepEqual(JSON.parse(env.files.get(folderIndex)), ["文件索引目录"])
  assert.deepEqual(env.mutations, [])
})

test("Android backup parsing rejects traversal without rejecting valid payloads", () => {
  const env = sandbox()
  const envelope = (folder) => ({ format: "BarcodeGeneratorInterchange", version: 1, payload: JSON.stringify({ folders: [folder], favorites: [] }) })
  assert.throws(() => env.storage.parseInterchangeBackup(envelope("../escape")), /文件夹/)
  assert.equal(env.storage.parseInterchangeBackup(envelope("工作/客户")).folders[0].name, "工作")
  const objects = (folders, favorites = []) => ({ format: "BarcodeGeneratorInterchange", version: 1, payload: JSON.stringify({ folders, favorites }) })
  assert.throws(() => env.storage.parseInterchangeBackup(objects([{ name: "工作", children: [".."] }])), /文件夹/)
  assert.throws(() => env.storage.parseInterchangeBackup(objects([{ name: "A/B", children: ["C"] }])), /文件夹/)
  assert.throws(() => env.storage.parseInterchangeBackup(objects([], [{ ...favorite(), rootFolder: "工作", subFolder: ".." }])), /文件夹/)
  assert.throws(() => env.storage.parseInterchangeBackup(objects([], [{ ...favorite(), folder: "A/B/C" }])), /文件夹/)
  const valid = env.storage.parseInterchangeBackup(objects([{ name: "工作", children: ["客户"] }], [favorite()]))
  assert.equal(valid.favorites[0].folder, "工作/客户")
})

test("folder creation rejects unsafe input before changing UI state", () => {
  const env = sandbox()
  let stateChanges = 0
  const create = env.callback("createFolder", { folders: ["保留"], setFolders: () => stateChanges++ })
  create("", "..")
  assert.equal(stateChanges, 0)
  assert.equal(env.mutations.length, 0)
  assert.equal(env.messages.length, 1)
})

test("folder creation, rename and favorite moves reject paths deeper than storage supports", async () => {
  const cases = [
    {
      name: "createFolder",
      args: ["A/B", "new"],
      bindings: (changed) => ({ folders: ["A", "A/B"], setFolders: changed }),
    },
    {
      name: "moveFavorite",
      args: ["one", "A/B/C"],
      bindings: (changed) => ({ favorites: [favorite({ folder: "A" })], setFavorites: changed }),
    },
    {
      name: "addFavorite",
      args: ["new", "A/B/C", [{ text: "123", type: "code128" }]],
      bindings: (changed) => ({
        items: [{ text: "123", type: "code128" }], barcodeType: "code128", favorites: [],
        makeRowId: () => "new", setFavorites: changed,
      }),
    },
    {
      name: "renameFolder",
      args: ["A", "B/C"],
      bindings: (changed) => ({
        folders: ["A", "A/sub"], favorites: [favorite({ folder: "A/sub" })],
        setFolders: changed, setFavorites: changed,
      }),
    },
  ]
  for (const scenario of cases) {
    const env = sandbox()
    let stateChanges = 0
    const action = env.callback(scenario.name, {
      setFolders: () => {}, setFavorites: () => {}, saveFolders: () => {}, saveFavorites: () => {},
      ...scenario.bindings(() => { stateChanges++ }),
    })
    await action(...scenario.args)
    assert.equal(stateChanges, 0, scenario.name)
    assert.equal(env.mutations.length, 0, scenario.name)
    assert.equal(env.messages.length, 1, scenario.name)
  }
})

test("barcode favorite folder picker omits paths beyond the supported depth", async () => {
  const menus = []
  let selectedFolder
  const collectFavorite = extractCallback("src/pages/BarcodesPage.tsx", "collectFavorite", {
    folders: ["A", "A/sub", "A/sub/deep"],
    favorites: [],
    Dialog: {
      actionSheet: async ({ actions }) => {
        const labels = actions.map((action) => action.label)
        menus.push(labels)
        return menus.length === 1 ? labels.indexOf("A") : labels.indexOf("sub")
      },
    },
    promptFavoriteName: async (folder) => { selectedFolder = folder },
  })

  await collectFavorite()

  assert.deepEqual(plain(menus), [
    ["A", "新建文件夹"],
    ["选择此文件夹", "sub", "新建文件夹", "返回"],
  ])
  assert.equal(selectedFolder, "A/sub")
  assert.equal(menus.flat().includes("deep"), false)
})

test("moving a favorite only offers destinations supported by storage", async () => {
  const menus = []
  const folders = ["A", "A/sub", "A/sub/deep", "B"]
  const current = favorite({ folder: "B" })
  let movedFolder
  const chooseMoveFolder = extractCallback("src/pages/FavoritesPage.tsx", "chooseMoveFolder", {
    folders,
    favorites: [current],
    Dialog: {
      actionSheet: async ({ actions }) => {
        const labels = actions.map((action) => action.label)
        menus.push(labels)
        return menus.length === 1 ? labels.indexOf("A") : labels.indexOf("sub")
      },
    },
  })
  const moveFavoriteToFolder = extractCallback("src/pages/FavoritesPage.tsx", "moveFavoriteToFolder", {
    chooseMoveFolder,
    onMoveFavorite: (_id, folder) => { movedFolder = folder },
  })

  await moveFavoriteToFolder(current)

  assert.deepEqual(plain(menus), [
    ["A", "B", "添加文件夹"],
    ["移动到此文件夹", "sub", "返回"],
  ])
  assert.equal(movedFolder, "A/sub")
})

test("new favorite folder picker excludes parents that would exceed storage depth", async () => {
  const env = sandbox()
  const parentMenus = []
  const current = favorite({ folder: "B" })
  let created
  let moved
  const moveFavoriteToFolder = extractCallback("src/pages/FavoritesPage.tsx", "moveFavoriteToFolder", {
    chooseMoveFolder: async () => "__create__",
    folders: ["A", "A/sub", "A/sub/deep"],
    favorites: [current],
    Dialog: {
      actionSheet: async ({ actions }) => {
        parentMenus.push(actions.map((action) => action.label))
        return 1
      },
      prompt: async () => "new",
    },
    onCreateFolder: (parent, name) => { created = [parent, name] },
    onMoveFavorite: (id, folder) => { moved = [id, folder] },
  })

  await moveFavoriteToFolder(current)

  assert.deepEqual(plain(parentMenus), [["根目录", "A", "B"]])
  assert.deepEqual(plain(created), ["A", "new"])
  assert.deepEqual(plain(moved), [current.id, "A/new"])
})

test("renaming and moving reject unsafe paths before changing UI state", () => {
  for (const name of ["renameFolder", "moveFolder", "moveFavorite"]) {
    const env = sandbox()
    let stateChanges = 0
    const callback = env.callback(name, {
      folders: ["工作", "工作/客户"], favorites: [favorite()],
      setFolders: () => stateChanges++, setFavorites: () => stateChanges++,
    })
    callback(name === "moveFavorite" ? "one" : "工作", "../escape")
    assert.equal(stateChanges, 0, name)
    assert.equal(env.mutations.length, 0, name)
    assert.equal(env.messages.length, 1, name)
  }
})

test("folder creation, rename and deletion roll back when the folder index cannot be saved", async () => {
  const cases = [
    { name: "createFolder", folders: ["A"], favorites: [], args: ["", "new"] },
    { name: "renameFolder", folders: ["A", "A/sub"], favorites: [favorite({ id: "nested", folder: "A/sub" })], args: ["A/sub", "B"] },
    { name: "deleteFolder", folders: ["A", "A/sub"], favorites: [favorite({ id: "nested", folder: "A/sub" })], args: ["A/sub"] },
  ]
  const outcomes = []

  for (const scenario of cases) {
    const env = sandbox()
    const folderIndex = "/mock/icloud/BarcodeGenerator/folders.json"
    env.storage.saveFolders(scenario.folders)
    env.storage.saveFavorites(scenario.favorites)
    const write = env.FileManager.writeAsStringSync
    env.FileManager.writeAsStringSync = (file, text) => {
      if (normalize(file) === folderIndex) throw new Error("simulated folder index write failure")
      write(file, text)
    }
    let stateFolders
    let stateFavorites
    const action = env.callback(scenario.name, {
      folders: scenario.folders,
      favorites: scenario.favorites,
      setFolders: (value) => { stateFolders = value },
      setFavorites: (value) => { stateFavorites = value },
      saveFolders: env.storage.saveFolders,
      saveFavorites: env.storage.saveFavorites,
    })

    await action(...scenario.args)

    const restarted = sandbox([...env.values])
    for (const [path, value] of env.files) restarted.files.set(path, value)
    for (const directory of env.directories) restarted.directories.add(directory)
    outcomes.push({
      name: scenario.name,
      stateFolders: stateFolders === undefined ? null : plain(stateFolders),
      stateFavorites: stateFavorites === undefined ? null : plain(stateFavorites),
      loadedFolders: plain(env.storage.loadFolders()),
      loadedFavorites: plain(env.storage.loadFavorites()),
      restartedFolders: plain(restarted.storage.loadFolders()),
      restartedFavorites: plain(restarted.storage.loadFavorites()),
      showedFailure: env.messages.length > 0,
    })
  }

  assert.deepEqual(outcomes, cases.map((scenario) => ({
    name: scenario.name,
    stateFolders: null,
    stateFavorites: null,
    loadedFolders: scenario.folders,
    loadedFavorites: scenario.favorites,
    restartedFolders: scenario.folders,
    restartedFavorites: scenario.favorites,
    showedFailure: true,
  })))
})

test("folder creation, rename and deletion still persist successfully", () => {
  const cases = [
    { name: "createFolder", folders: ["A"], favorites: [], args: ["A", "new"], expectedFolders: ["A", "A/new"], expectedFavorites: [] },
    {
      name: "renameFolder", folders: ["A", "A/sub"], favorites: [favorite({ id: "nested", folder: "A/sub" })],
      args: ["A/sub", "B"], expectedFolders: ["A", "B"], expectedFavorites: [favorite({ id: "nested", folder: "B" })],
    },
    {
      name: "deleteFolder", folders: ["A", "A/sub"], favorites: [favorite({ id: "nested", folder: "A/sub" })],
      args: ["A/sub"], expectedFolders: ["A"], expectedFavorites: [],
    },
  ]

  for (const scenario of cases) {
    const env = sandbox()
    env.storage.saveFolders(scenario.folders)
    env.storage.saveFavorites(scenario.favorites)
    let stateFolders
    let stateFavorites
    const action = env.callback(scenario.name, {
      folders: scenario.folders,
      favorites: scenario.favorites,
      setFolders: (value) => { stateFolders = value },
      setFavorites: (value) => { stateFavorites = value },
    })

    action(...scenario.args)

    assert.deepEqual(plain(stateFolders), scenario.expectedFolders, scenario.name)
    if (scenario.name !== "createFolder") assert.deepEqual(plain(stateFavorites), scenario.expectedFavorites, scenario.name)
    assert.deepEqual(plain(env.storage.loadFolders()), scenario.expectedFolders, scenario.name)
    assert.deepEqual(plain(env.storage.loadFavorites()), scenario.expectedFavorites, scenario.name)
    assert.equal(env.messages.length, 0, scenario.name)
  }
})

test("moving a folder under a parent retains its name", () => {
  const env = sandbox()
  let savedFolders
  let savedFavorites
  const move = env.callback("moveFolder", {
    folders: ["A", "B"],
    favorites: [favorite({ folder: "A" })],
    setFolders: () => {},
    setFavorites: () => {},
    saveFolders: (value) => { savedFolders = value },
    saveFavorites: (value) => { savedFavorites = value },
    loadFolders: () => savedFolders,
    loadFavorites: () => savedFavorites,
  })

  move("A", "B")

  assert.deepEqual(plain(savedFolders), ["B/A", "B"])
  assert.deepEqual(plain(savedFavorites.map((item) => item.folder)), ["B/A"])
})

test("moving a nested folder to root retains its name and descendants", () => {
  const env = sandbox()
  let savedFolders
  let savedFavorites
  const move = env.callback("moveFolder", {
    folders: ["A", "A/sub", "A/sub/deep"],
    favorites: [favorite({ folder: "A/sub" }), favorite({ id: "deep", folder: "A/sub/deep" })],
    setFolders: () => {},
    setFavorites: () => {},
    saveFolders: (value) => { savedFolders = value },
    saveFavorites: (value) => { savedFavorites = value },
    loadFolders: () => savedFolders,
    loadFavorites: () => savedFavorites,
  })

  move("A/sub", "")

  assert.deepEqual(plain(savedFolders), ["A", "sub", "sub/deep"])
  assert.deepEqual(plain(savedFavorites.map((item) => item.folder)), ["sub", "sub/deep"])
})

test("moving a nested folder to root persists its name and descendants to disk", async () => {
  const env = sandbox()
  const folders = ["A", "A/sub", "A/sub/deep"]
  const favorites = [
    favorite({ id: "nested", folder: "A/sub" }),
    favorite({ id: "deeper", folder: "A/sub/deep" }),
  ]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites(favorites)

  let stateFolders
  let stateFavorites
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites,
    setFolders: (value) => { stateFolders = value },
    setFavorites: (value) => { stateFavorites = value },
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites,
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "根目录") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(stateFolders), ["A", "sub", "sub/deep"])
  assert.deepEqual(plain(stateFavorites.map((item) => item.folder)), ["sub", "sub/deep"])
  const nestedFile = "/mock/icloud/BarcodeGenerator/favorites/sub/nested.json"
  const deeperFile = "/mock/icloud/BarcodeGenerator/favorites/sub/deep/deeper.json"
  assert.equal(JSON.parse(env.files.get(nestedFile)).folder, "sub")
  assert.equal(JSON.parse(env.files.get(deeperFile)).folder, "sub/deep")
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/nested.json"), false)
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/deep/deeper.json"), false)
  assert.deepEqual(plain(env.storage.loadFolders()), ["A", "sub", "sub/deep"])
  assert.deepEqual(plain(env.storage.loadFavorites().map((item) => item.folder)), ["sub", "sub/deep"])
})

test("moving an empty nested folder to root retains its name after reload", async () => {
  const env = sandbox()
  const folders = ["A", "A/sub"]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites([])
  let stateFolders
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites: [],
    setFolders: (value) => { stateFolders = value },
    setFavorites: () => {},
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites: [],
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "根目录") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(stateFolders), ["A", "sub"])
  assert.deepEqual(plain(env.storage.loadFolders()), ["A", "sub"])
  const restarted = sandbox([...env.values])
  for (const [path, value] of env.files) restarted.files.set(path, value)
  for (const directory of env.directories) restarted.directories.add(directory)
  assert.deepEqual(plain(restarted.storage.loadFolders()), ["A", "sub"])
  assert.deepEqual(plain(restarted.storage.loadFavorites()), [])
})

test("moving a nested folder aborts when an existing folder index cannot be updated", async () => {
  const env = sandbox()
  const folders = ["A", "A/sub"]
  const favorites = [favorite({ id: "nested", folder: "A/sub" })]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites(favorites)
  const write = env.FileManager.writeAsStringSync
  env.FileManager.writeAsStringSync = (file, text) => {
    if (normalize(file) === "/mock/icloud/BarcodeGenerator/folders.json") throw new Error("simulated folder index write failure")
    write(file, text)
  }
  let stateFolders
  let stateFavorites
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites,
    setFolders: (value) => { stateFolders = value },
    setFavorites: (value) => { stateFavorites = value },
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites,
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "根目录") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(env.storage.loadFolders()), folders)
  assert.deepEqual(plain(env.values.get("local:favorite_folders")), folders)
  assert.equal(stateFolders, undefined)
  assert.equal(stateFavorites, undefined)
  assert.deepEqual(plain(env.storage.loadFavorites()), favorites)
  assert.ok(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/nested.json"))
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/sub/nested.json"), false)
  assert.match(env.messages[0], /保存|移动/)
  const restarted = sandbox([...env.values])
  for (const [path, value] of env.files) restarted.files.set(path, value)
  for (const directory of env.directories) restarted.directories.add(directory)
  assert.deepEqual(plain(restarted.storage.loadFolders()), folders)
  assert.deepEqual(plain(restarted.storage.loadFavorites()), favorites)
})

test("moving a nested folder keeps the Storage fallback when no folder index exists", async () => {
  const env = sandbox()
  const folders = ["A", "A/sub"]
  const folderIndex = "/mock/icloud/BarcodeGenerator/folders.json"
  env.storage.saveFolders(folders)
  env.storage.saveFavorites([])
  env.files.delete(folderIndex)
  const write = env.FileManager.writeAsStringSync
  env.FileManager.writeAsStringSync = (file, text) => {
    if (normalize(file) === folderIndex) throw new Error("simulated folder index write failure")
    write(file, text)
  }
  let stateFolders
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites: [],
    setFolders: (value) => { stateFolders = value },
    setFavorites: () => {},
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites: [],
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "根目录") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(stateFolders), ["A", "sub"])
  assert.deepEqual(plain(env.storage.loadFolders()), ["A", "sub"])
  assert.equal(env.files.has(folderIndex), false)
  assert.equal(env.messages.length, 0)
  const restarted = sandbox([...env.values])
  for (const [path, value] of env.files) restarted.files.set(path, value)
  for (const directory of env.directories) restarted.directories.add(directory)
  assert.deepEqual(plain(restarted.storage.loadFolders()), ["A", "sub"])
})

test("moving a nested folder under an existing parent persists the full destination path", async () => {
  const env = sandbox()
  const folders = ["A", "A/sub", "B"]
  const favorites = [favorite({ id: "nested", folder: "A/sub" })]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites(favorites)

  let stateFolders
  let stateFavorites
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites,
    setFolders: (value) => { stateFolders = value },
    setFavorites: (value) => { stateFavorites = value },
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites,
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "B") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(stateFolders), ["A", "B/sub", "B"])
  assert.deepEqual(plain(stateFavorites.map((item) => item.folder)), ["B/sub"])
  const nestedFile = "/mock/icloud/BarcodeGenerator/favorites/B/sub/nested.json"
  assert.equal(JSON.parse(env.files.get(nestedFile)).folder, "B/sub")
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/nested.json"), false)
  assert.deepEqual(plain(env.storage.loadFolders()), ["A", "B/sub", "B"])
  assert.deepEqual(plain(env.storage.loadFavorites().map((item) => item.folder)), ["B/sub"])
})

test("moving an implicit folder preserves its leaf name and similarly prefixed siblings", async () => {
  const env = sandbox()
  const folders = ["A", "Aardvark"]
  const favorites = [
    favorite({ id: "source", folder: "A/sub" }),
    favorite({ id: "sibling", folder: "A/submarine" }),
  ]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites(favorites)
  let savedFolders
  let savedFavorites
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites,
    setFolders: (value) => { savedFolders = value },
    setFavorites: (value) => { savedFavorites = value },
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites,
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "根目录") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(savedFolders), ["A", "Aardvark"])
  assert.deepEqual(plain(savedFavorites.map((item) => item.folder)), ["sub", "A/submarine"])
  assert.equal(JSON.parse(env.files.get("/mock/icloud/BarcodeGenerator/favorites/sub/source.json")).folder, "sub")
  assert.equal(JSON.parse(env.files.get("/mock/icloud/BarcodeGenerator/favorites/A/submarine/sibling.json")).folder, "A/submarine")
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/source.json"), false)
  const restarted = sandbox([...env.values])
  for (const [path, value] of env.files) restarted.files.set(path, value)
  for (const directory of env.directories) restarted.directories.add(directory)
  assert.deepEqual(plain(restarted.storage.loadFavorites().map((item) => item.folder)), ["sub", "A/submarine"])
})

test("moving an implicit folder with only descendant favorites retains its name after reload", async () => {
  const env = sandbox()
  const folders = ["A"]
  const favorites = [favorite({ id: "deep", folder: "A/sub/deep" })]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites(favorites)
  let stateFolders
  let stateFavorites
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites,
    setFolders: (value) => { stateFolders = value },
    setFavorites: (value) => { stateFavorites = value },
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites,
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "根目录") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(stateFolders), ["A"])
  assert.deepEqual(plain(stateFavorites.map((item) => item.folder)), ["sub/deep"])
  assert.ok(env.files.has("/mock/icloud/BarcodeGenerator/favorites/sub/deep/deep.json"))
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/deep/deep.json"), false)

  const restarted = sandbox([...env.values])
  for (const [path, value] of env.files) restarted.files.set(path, value)
  for (const directory of env.directories) restarted.directories.add(directory)
  assert.deepEqual(plain(restarted.storage.loadFolders()), ["A"])
  assert.deepEqual(plain(restarted.storage.loadFavorites().map((item) => item.folder)), ["sub/deep"])
  const pageSource = fs.readFileSync(path.join(root, "src/pages/FavoritesPage.tsx"), "utf8")
  assert.match(pageSource, /const allFolderNames = Array\.from\(new Set\(\[\.\.\.folderNames, \.\.\.filteredFavorites\.map\(\(f\) => f\.folder \|\| ""\)\]\)\)/)
})

test("moving into an existing same-name folder retains both folders' favorites", async () => {
  const env = sandbox()
  const folders = ["A", "A/sub", "B", "B/sub"]
  const favorites = [
    favorite({ id: "moving", folder: "A/sub" }),
    favorite({ id: "existing", folder: "B/sub" }),
  ]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites(favorites)
  let savedFavorites
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites,
    setFolders: () => {},
    setFavorites: (value) => { savedFavorites = value },
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites,
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "B") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(savedFavorites.map((item) => [item.id, item.folder])), [
    ["moving", "B/sub"],
    ["existing", "B/sub"],
  ])
  assert.ok(env.files.has("/mock/icloud/BarcodeGenerator/favorites/B/sub/moving.json"))
  assert.ok(env.files.has("/mock/icloud/BarcodeGenerator/favorites/B/sub/existing.json"))
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/moving.json"), false)
  assert.deepEqual(plain(env.storage.loadFolders()), ["A", "B/sub", "B"])
})

test("moving a nested folder to a same-name root folder preserves both subtrees", async () => {
  const env = sandbox()
  const folders = ["A", "A/sub", "A/sub/deep", "sub", "sub/deep"]
  const favorites = [
    favorite({ id: "moving", folder: "A/sub" }),
    favorite({ id: "moving-deep", folder: "A/sub/deep" }),
    favorite({ id: "existing", folder: "sub" }),
    favorite({ id: "existing-deep", folder: "sub/deep" }),
  ]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites(favorites)
  let stateFolders
  let stateFavorites
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites,
    setFolders: (value) => { stateFolders = value },
    setFavorites: (value) => { stateFavorites = value },
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites,
    Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === "根目录") },
    onMoveFolder: applyMove,
  })

  await chooseMove("A/sub")

  assert.deepEqual(plain(stateFolders), ["A", "sub", "sub/deep"])
  assert.deepEqual(plain(stateFavorites.map((item) => [item.id, item.folder])), [
    ["moving", "sub"],
    ["moving-deep", "sub/deep"],
    ["existing", "sub"],
    ["existing-deep", "sub/deep"],
  ])
  for (const id of ["moving", "existing"]) assert.ok(env.files.has(`/mock/icloud/BarcodeGenerator/favorites/sub/${id}.json`))
  for (const id of ["moving-deep", "existing-deep"]) assert.ok(env.files.has(`/mock/icloud/BarcodeGenerator/favorites/sub/deep/${id}.json`))
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/moving.json"), false)
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/A/sub/deep/moving-deep.json"), false)
  assert.deepEqual(plain(env.storage.loadFolders()), ["A", "sub", "sub/deep"])

  const restarted = sandbox([...env.values])
  for (const [path, value] of env.files) restarted.files.set(path, value)
  for (const directory of env.directories) restarted.directories.add(directory)
  assert.deepEqual(plain(restarted.storage.loadFolders()), ["A", "sub", "sub/deep"])
  assert.deepEqual(plain(restarted.storage.loadFavorites().map((item) => [item.id, item.folder])), [
    ["moving", "sub"],
    ["moving-deep", "sub/deep"],
    ["existing", "sub"],
    ["existing-deep", "sub/deep"],
  ])
})

test("folder move prevents a parent destination from exceeding the supported depth", async () => {
  const env = sandbox()
  const folders = ["A", "A/sub", "B"]
  const favorites = [favorite({ id: "nested", folder: "A/sub" })]
  env.storage.saveFolders(folders)
  env.storage.saveFavorites(favorites)
  const beforeFiles = plain([...env.files.entries()])
  const beforeMutationCount = env.mutations.length
  let stateFolders
  let stateFavorites
  const applyMove = env.callback("moveFolder", {
    folders,
    favorites,
    setFolders: (value) => { stateFolders = value },
    setFavorites: (value) => { stateFavorites = value },
    saveFolders: env.storage.saveFolders,
    saveFavorites: env.storage.saveFavorites,
  })
  const choices = []
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders,
    favorites,
    alert: async (message) => { env.messages.push(message) },
    Dialog: {
      actionSheet: async ({ actions }) => {
        choices.push(actions.map((action) => action.label))
        return null
      },
    },
    onMoveFolder: applyMove,
  })

  await chooseMove("A")
  applyMove("A", "B")

  assert.deepEqual(plain(choices), [])
  assert.equal(stateFolders, undefined)
  assert.equal(stateFavorites, undefined)
  assert.equal(env.mutations.length, beforeMutationCount)
  assert.deepEqual(plain([...env.files.entries()]), beforeFiles)
  assert.equal(env.messages.length, 2)
})

test("folder move rejects self and descendant targets before persistence", () => {
  const scenarios = [
    { name: "same folder", folder: "A/sub", parent: "A/sub", expectedAlerts: 1 },
    { name: "descendant", folder: "A", parent: "A/sub", expectedAlerts: 1 },
    { name: "current parent no-op", folder: "A/sub", parent: "A", expectedAlerts: 0 },
  ]

  for (const scenario of scenarios) {
    const env = sandbox()
    const folders = ["A", "A/sub", "A/sub/deep"]
    const favorites = [favorite({ id: "nested", folder: "A/sub" }), favorite({ id: "deep", folder: "A/sub/deep" })]
    env.storage.saveFolders(folders)
    env.storage.saveFavorites(favorites)
    const beforeFiles = plain([...env.files.entries()])
    const beforeMutationCount = env.mutations.length
    let stateChanges = 0
    const move = env.callback("moveFolder", {
      folders,
      favorites,
      setFolders: () => stateChanges++,
      setFavorites: () => stateChanges++,
      saveFolders: env.storage.saveFolders,
      saveFavorites: env.storage.saveFavorites,
    })

    move(scenario.folder, scenario.parent)

    assert.equal(stateChanges, 0, scenario.name)
    assert.equal(env.mutations.length, beforeMutationCount, scenario.name)
    assert.deepEqual(plain([...env.files.entries()]), beforeFiles, scenario.name)
    assert.equal(env.messages.length, scenario.expectedAlerts, scenario.name)
  }
})

test("folder move action carries the selected destination into the persisted mapping", async () => {
  async function moveThroughPage(folder, destinationLabel, folders, favorites) {
    const env = sandbox()
    let savedFolders
    let savedFavorites
    const applyMove = env.callback("moveFolder", {
      folders,
      favorites,
      setFolders: () => {},
      setFavorites: () => {},
      saveFolders: (value) => { savedFolders = value },
      saveFavorites: (value) => { savedFavorites = value },
      loadFolders: () => savedFolders,
      loadFavorites: () => savedFavorites,
    })
    const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
      folders,
      favorites,
      Dialog: { actionSheet: async ({ actions }) => actions.findIndex((action) => action.label === destinationLabel) },
      onMoveFolder: applyMove,
    })

    await chooseMove(folder)

    return { savedFolders: plain(savedFolders), favoriteFolders: plain(savedFavorites.map((item) => item.folder)) }
  }

  assert.deepEqual(await moveThroughPage("A/sub", "B", ["A", "A/sub", "B"], [
    favorite({ id: "nested", folder: "A/sub" }),
  ]), {
    savedFolders: ["A", "B/sub", "B"],
    favoriteFolders: ["B/sub"],
  })
  assert.deepEqual(await moveThroughPage("A/sub", "根目录", ["A", "A/sub", "A/sub/deep"], [
    favorite({ folder: "A/sub" }), favorite({ id: "deep", folder: "A/sub/deep" }),
  ]), {
    savedFolders: ["A", "sub", "sub/deep"],
    favoriteFolders: ["sub", "sub/deep"],
  })
})

test("folder move destinations exclude no-op and unsupported-depth targets", async () => {
  const choices = []
  const messages = []
  const chooseMove = extractCallback("src/pages/FavoritesPage.tsx", "moveFolder", {
    folders: ["A", "A/sub", "A/sub/deep", "B"],
    favorites: [favorite({ folder: "A/sub" }), favorite({ id: "deep", folder: "A/sub/deep" })],
    alert: async (message) => { messages.push(message) },
    Dialog: {
      actionSheet: async ({ actions }) => {
        choices.push(actions.map((action) => action.label))
        return null
      },
    },
    onMoveFolder: () => assert.fail("Cancelling the destination picker must not move a folder"),
  })

  await chooseMove("A")
  await chooseMove("A/sub")

  assert.deepEqual(plain(choices), [
    ["根目录"],
  ])
  assert.equal(messages.length, 1)
})

test("adding a favorite from a detail uses the displayed items and barcode type", async () => {
  const env = sandbox()
  let savedFavorites
  const addFavorite = env.callback("addFavorite", {
    items: [{ text: "generator content", type: "code128" }],
    barcodeType: "code128",
    favorites: [],
    makeRowId: () => "new",
    setFavorites: () => {},
    saveFavorites: (value) => { savedFavorites = value },
  })

  await addFavorite("detail copy", "", [{ text: "EAN detail", type: "ean13" }])

  assert.deepEqual(plain(savedFavorites), [{
    id: "new", name: "detail copy", texts: ["EAN detail"], type: "ean13", folder: "",
    time: savedFavorites[0].time,
  }])
})

test("same-name favorites of another type do not trigger overwrite from a detail", async () => {
  const env = sandbox()
  const existing = favorite({ id: "existing", name: "同名", texts: ["root"], type: "code128", folder: "" })
  let savedFavorites
  const addFavorite = env.callback("addFavorite", {
    items: [{ text: "generator content", type: "code128" }],
    barcodeType: "code128",
    favorites: [existing],
    makeRowId: () => "detail-copy",
    setFavorites: () => {},
    saveFavorites: (value) => { savedFavorites = value },
  })

  await addFavorite("同名", "", [{ text: "EAN detail", type: "ean13" }])

  assert.equal(savedFavorites.length, 2)
  assert.equal(savedFavorites[0].id, "detail-copy")
  assert.equal(savedFavorites[0].type, "ean13")
  assert.equal(savedFavorites[0].texts[0], "EAN detail")
  assert.equal(savedFavorites[1].id, "existing")
})

test("over-limit imported favorites stay stored but are not built for display", async () => {
  const env = sandbox()
  const imported = env.storage.normalizeFavorite({ ...favorite(), texts: Array(101).fill("A") })
  const messages = []
  let buildCalls = 0
  let selected = null
  const selectFavorite = extractCallback("src/pages/FavoritesPage.tsx", "selectFavorite", {
    validateTexts: env.validation.validateTexts,
    alert: async (message) => messages.push(message),
    buildItems: async (texts, type) => { buildCalls++; return texts.map((text) => ({ text, type })) },
    setSelectedFavorite: (value) => { selected = value },
  })

  await selectFavorite(imported)

  assert.equal(imported.texts.length, 101)
  assert.equal(buildCalls, 0)
  assert.equal(selected, null)
  assert.equal(messages.length, 1)
  assert.match(messages[0], /100/)

  await selectFavorite(favorite())
  assert.equal(buildCalls, 1)
  assert.equal(plain(selected).favorite.id, "one")
})

test("over-limit legacy history stays stored but is not built for display", async () => {
  const previous = [{ id: "legacy", texts: Array(101).fill("A"), type: "code128", time: 1 }]
  const env = sandbox([["local:recent_history", previous]])
  const imported = env.storage.loadHistory()[0]
  const messages = []
  let buildCalls = 0
  let selected = null
  const selectHistory = extractCallback("src/pages/HistoryPage.tsx", "selectHistory", {
    validateTexts: env.validation.validateTexts,
    Dialog: { alert: async ({ message }) => messages.push(message) },
    buildItems: async (texts, type) => { buildCalls++; return texts.map((text) => ({ text, type })) },
    setSelectedHistory: (value) => { selected = value },
  })

  await selectHistory(imported)

  assert.equal(env.storage.loadHistory()[0].texts.length, 101)
  assert.equal(buildCalls, 0)
  assert.equal(selected, null)
  assert.equal(messages.length, 1)
  assert.match(messages[0], /100/)

  await selectHistory({ id: "valid", texts: ["ABC"], type: "code128", time: 2 })
  assert.equal(buildCalls, 1)
  assert.equal(plain(selected).item.id, "valid")
})

test("Code 128-B hint matches its printable ASCII input range", () => {
  const { core } = sandbox()
  const hint = core.BARCODE_TYPES.find((type) => type.id === "code128").hint

  assert.match(hint, /ASCII/)
  assert.notEqual(core.encodeBarcode("code128", "~"), null)
  assert.equal(core.encodeBarcode("code128", "中文"), null)
})

test("fixed-length barcode hints distinguish input digits from encoded check digits", () => {
  const env = sandbox()
  const getHint = extractCallback("index.tsx", "barcodeTypeHint", { BARCODE_TYPES: env.core.BARCODE_TYPES })
  const cases = [
    ["ean13", 12, 13],
    ["ean8", 7, 8],
    ["upca", 11, 12],
    ["itf14", 13, 14],
  ]

  for (const [type, dataDigits, encodedDigits] of cases) {
    assert.match(getHint(type), new RegExp(`${dataDigits} 位.*校验位.*${encodedDigits} 位`), type)
    assert.notEqual(env.core.encodeBarcode(type, "0".repeat(dataDigits)), null, `${type}: data digits auto-calculate`)
    assert.notEqual(env.core.encodeBarcode(type, "0".repeat(encodedDigits)), null, `${type}: valid supplied check digit`)
    assert.equal(env.core.encodeBarcode(type, `${"0".repeat(encodedDigits - 1)}1`), null, `${type}: invalid supplied check digit`)
  }

  assert.match(fs.readFileSync(path.join(root, "index.tsx"), "utf8"), /barcodeTypeHint\(barcodeType\)/)
})

test("fixed-length barcode captions show the full encoded value", () => {
  const env = sandbox()
  const pageSource = fs.readFileSync(path.join(root, "src/pages/BarcodesPage.tsx"), "utf8")
  const cases = [
    ["ean13", "400638133393", "4006381333931"],
    ["ean8", "9638507", "96385074"],
    ["upca", "03600029145", "036000291452"],
    ["itf14", "1001234500001", "10012345000017"],
  ]

  for (const [type, input, encoded] of cases) {
    assert.notEqual(env.core.encodeBarcode(type, input), null, `${type} input should encode`)
    assert.equal(env.core.humanReadableBarcodeText(type, input), encoded, `${type} should show its check digit`)
    assert.equal(env.core.humanReadableBarcodeText(type, encoded), encoded, `${type} should preserve a supplied valid check digit`)
    assert.equal(env.core.humanReadableBarcodeText(type, `${input.slice(0, 3)} ${input.slice(3)}`), encoded, `${type} should match whitespace-insensitive encoding`)
  }
  assert.match(pageSource, /humanReadableBarcodeText\(item\.type, item\.text\)/)
})

test("barcode canvas draws pixel-aligned bars with quiet zones at common screen scales", () => {
  const bits = [1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0]
  const quietModules = 10

  for (const scale of [2, 3]) {
    const fills = []
    const env = sandbox([], {
      Device: { screen: { scale } },
      React: { createElement: (type, props) => type(props) },
      scripting: {
        Device: { screen: { scale } },
        Canvas: ({ frame, draw }) => {
          let fillStyle = ""
          draw({
            get fillStyle() { return fillStyle },
            set fillStyle(value) { fillStyle = value },
            fillRect(x, y, width, height) { fills.push({ color: fillStyle, x, y, width, height }) },
          })
          return frame
        },
      },
    })
    const frame = env.core.BarcodeCanvas({ bits, barW: 3.7, barH: 80, quietModules, maxWidth: 330 })
    const layout = env.core.barcodeLayout(bits.length, 3.7, 330, quietModules)
    const blackBars = fills.filter((fill) => fill.color === "#000000")
    const expectedRuns = []
    for (let i = 0; i < bits.length;) {
      if (bits[i] !== 1) { i++; continue }
      const start = i
      while (i < bits.length && bits[i] === 1) i++
      expectedRuns.push([start, i])
    }

    assert.equal(blackBars.length, expectedRuns.length)
    for (let i = 0; i < blackBars.length; i++) {
      const bar = blackBars[i]
      const [runStart, runEnd] = expectedRuns[i]
      const xPixels = bar.x * scale
      const widthPixels = bar.width * scale
      assert.ok(Math.abs(xPixels - Math.round(xPixels)) < 1e-8, "bar starts on a physical pixel")
      assert.ok(Math.abs(widthPixels - Math.round(widthPixels)) < 1e-8, "bar width spans whole physical pixels")
      assert.equal(Math.round(xPixels), Math.round((quietModules + runStart) * layout.modulePixels))
      assert.equal(Math.round((bar.x + bar.width) * scale), Math.round((quietModules + runEnd) * layout.modulePixels))
    }

    const widthPixels = Math.round(frame.width * scale)
    const firstBlackPixel = Math.round(blackBars[0].x * scale)
    const lastBlackPixel = Math.round((blackBars.at(-1).x + blackBars.at(-1).width) * scale)
    const trailingWhiteModules = bits.length - expectedRuns.at(-1)[1]
    assert.ok(Math.abs(firstBlackPixel - quietModules * layout.modulePixels) <= 0.5)
    assert.ok(Math.abs((widthPixels - lastBlackPixel) - (quietModules + trailingWhiteModules) * layout.modulePixels) <= 0.5)
    assert.equal(env.core.isBarcodeScanDense(600, 4, 330), true)
  }
})

test("scan reports items dropped when existing input uses part of the limit", async () => {
  const env = sandbox()
  const existing = Array.from({ length: 90 }, (_, index) => `existing-${index}`)
  const scanned = Array.from({ length: 20 }, (_, index) => `scanned-${index}`)
  let nextRows = existing
  const scanInput = env.callback("scanInput", {
    inputRows: existing,
    MAX_BARCODE_ITEMS: 100,
    scanTexts: async () => scanned,
    setInputRows: (update) => { nextRows = typeof update === "function" ? update(nextRows) : update },
  })

  assert.equal(await scanInput(), true)

  assert.deepEqual(plain(nextRows), [...existing, ...scanned.slice(0, 10)])
  assert.equal(env.messages.length, 1)
  assert.match(env.messages[0], /10/)
})

test("script entry does not import the inactive duplicate input page", () => {
  const indexSource = fs.readFileSync(path.join(root, "index.tsx"), "utf8")
  assert.ok(!/from ["']\.\/src\/pages\/InputPage["']/.test(indexSource), "remove the unused InputPage import instead of loading a second implementation")
})

test("text-recognition fill labels describe OCR rather than barcode scanning", async () => {
  const indexSource = fs.readFileSync(path.join(root, "index.tsx"), "utf8")
  const widgetSource = fs.readFileSync(path.join(root, "widget.tsx"), "utf8")
  const scanOptions = []
  const env = sandbox([], {
    Vision: { scanDocument: async (options) => { scanOptions.push(options); return ["货号 123", "批次\n456"] } },
  })

  assert.match(indexSource, /识别文字填充/)
  assert.doesNotMatch(indexSource, /<Text[^>]*>扫描填充<\/Text>|title="扫描填充"/)
  assert.match(widgetSource, /scanFill: "识别文字填充"/)
  assert.match(widgetSource, /scanFill: "辨識文字填入"/)
  assert.match(widgetSource, /scanFill: "Recognize & Fill"/)
  assert.deepEqual(plain(await env.core.scanTexts()), ["货号 123", "批次", "456"])
  assert.equal(scanOptions.length, 1)
  assert.equal(scanOptions[0].recognitionLevel, "accurate")
})

test("unsafe historical data stays intact and does not trigger startup writes", () => {
  const original = [favorite({ folder: ".." })]
  const env = sandbox([["local:favorites", original], ["local:favorite_folders", [".."]]])
  assert.deepEqual(env.values.get("local:favorites"), original)
  assert.deepEqual(env.values.get("local:favorite_folders"), [".."])
  assert.equal(env.values.has("shared:favorites"), false)
  assert.equal(env.mutations.length, 0)
  assert.equal(env.storage.loadFavorites()[0].folder, "..")
})

test("valid historical favorites and folders still migrate to shared storage", () => {
  const original = [favorite()]
  const env = sandbox([["local:favorites", original], ["local:favorite_folders", ["工作", "工作/客户"]]])
  assert.deepEqual(plain(env.values.get("shared:favorites")), original)
  assert.deepEqual(plain(env.values.get("shared:favorite_folders")), ["工作", "工作/客户"])
})

test("legacy favorite migration does not overwrite current favorites in shared Storage", () => {
  const current = [favorite({ id: "current", name: "当前收藏" })]
  const legacy = [favorite({ id: "legacy", name: "旧版收藏" })]
  const env = sandbox([["shared:favorites", current], ["shared:barcode_generator_legacy_favorites", legacy]])

  assert.deepEqual(plain(env.storage.loadFavorites()), current)
  assert.deepEqual(plain(env.values.get("shared:favorites")), current)
  assert.equal(env.values.has("local:favorites"), false)
})

test("legacy favorite migration does not resurrect favorites after an intentional clear", () => {
  const legacy = [favorite({ id: "legacy", name: "旧版收藏" })]
  const env = sandbox([["shared:favorites", []], ["shared:barcode_generator_legacy_favorites", legacy]])

  assert.deepEqual(plain(env.storage.loadFavorites()), [])
  assert.deepEqual(plain(env.values.get("shared:favorites")), [])
  assert.equal(env.values.has("local:favorites"), false)
})

test("legacy favorite migration leaves current local favorites unchanged", () => {
  const current = [favorite({ id: "current", name: "当前收藏" })]
  const legacy = [favorite({ id: "legacy", name: "旧版收藏" })]
  const env = sandbox([["local:favorites", current], ["shared:barcode_generator_legacy_favorites", legacy]])

  assert.deepEqual(plain(env.storage.loadFavorites()), current)
  assert.deepEqual(plain(env.values.get("local:favorites")), current)
  assert.deepEqual(plain(env.values.get("shared:favorites")), current)
})

test("legacy favorite migration still runs when no current favorite store exists", () => {
  const legacy = [favorite({ id: "legacy", name: "旧版收藏" })]
  const env = sandbox([["shared:barcode_generator_legacy_favorites", legacy]])

  assert.deepEqual(plain(env.storage.loadFavorites()), legacy)
  assert.deepEqual(plain(env.values.get("shared:favorites")), legacy)
  assert.deepEqual(plain(env.values.get("local:favorites")), legacy)
})

test("clearing history is not undone by legacy migration after restart", async () => {
  const previousHistory = [{ id: "legacy", texts: ["kept before clear"], type: "code128", time: 1 }]
  const env = sandbox([["shared:barcode_generator_legacy_history", previousHistory]])
  let visibleHistory
  const clearHistory = env.callback("clearHistory", {
    HISTORY_KEY: "recent_history",
    setHistory: (value) => { visibleHistory = value },
    Dialog: { confirm: async () => true },
  })

  await clearHistory()

  assert.deepEqual(plain(visibleHistory), [])
  const restarted = sandbox([...env.values])
  assert.equal(restarted.storage.loadHistory().length, 0)
})

test("export refuses unsafe legacy paths before creating an archive", async () => {
  const env = sandbox()
  await env.callback("exportBackup", { folders: [".."], favorites: [] })()
  assert.equal(env.mutations.length, 0)
  assert.equal(env.messages[0].title, "导出失败")
})

test("legacy whole-file iOS JSON backup reports the unsupported format without importing", async () => {
  const env = sandbox()
  env.FileManager.unzip = async (_, destination) => {
    env.files.set(`${destination}/barcode-generator-backup.json`, JSON.stringify({ favorites: [favorite()] }))
  }

  await env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => ["/mock/legacy-backup.zip"] },
    BACKUP_MANIFEST_NAMES: ["barcode-generator-backup.json", "barcode-generator-backup-android.json"],
    folders: [], favorites: [], makeRowId: () => "generated",
    setFolders: () => assert.fail("Unsupported backup changed folder state"),
    setFavorites: () => assert.fail("Unsupported backup changed favorite state"),
  })()

  assert.equal(env.values.size, 0)
  assert.equal(env.messages[0].title, "备份导入失败")
  assert.match(env.messages[0].message, /不再支持旧版整体 JSON 备份.*新版文件夹备份/)
})

test("README describes text recognition and supported backup formats accurately", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8")
  assert.match(readme, /文字识别填充/)
  assert.doesNotMatch(readme, /扫描填充/)
  assert.match(readme, /新版文件夹 ZIP/)
  assert.match(readme, /Android ZIP/)
  assert.match(readme, /旧版整体 JSON/)
})

test("backup import reports document picker failures without changing data", async () => {
  const env = sandbox()
  const importBackup = env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => { throw new Error("文件选择器不可用") } },
    BACKUP_MANIFEST_NAMES: [], folders: [], favorites: [], makeRowId: () => "generated",
    setFolders: () => assert.fail("Picker failure must not change folders"),
    setFavorites: () => assert.fail("Picker failure must not change favorites"),
  })

  await importBackup()

  assert.equal(env.messages.length, 1)
  assert.equal(env.messages[0].title, "备份导入失败")
  assert.match(env.messages[0].message, /文件选择器不可用/)
  assert.equal(env.mutations.length, 0)
})

test("backup import cancellation remains a no-op", async () => {
  for (const result of [null, []]) {
    const env = sandbox()
    await env.callback("importBackup", {
      DocumentPicker: { pickFiles: async () => result },
      BACKUP_MANIFEST_NAMES: [], folders: [], favorites: [],
      setFolders: () => assert.fail("Cancelled import must not change folders"),
      setFavorites: () => assert.fail("Cancelled import must not change favorites"),
    })()

    assert.equal(env.messages.length, 0)
    assert.equal(env.mutations.length, 0)
  }
})

test("concurrent ZIP imports use separate extraction directories", async () => {
  const env = sandbox()
  const destinations = []
  let pickerIndex = 0
  let idCounter = 0
  let arrivals = 0
  let releaseUnzip
  let resolveBothArrived
  const unzipGate = new Promise((resolve) => { releaseUnzip = resolve })
  const bothArrived = new Promise((resolve) => { resolveBothArrived = resolve })
  class FixedDate extends Date { static now() { return 123456789 } }
  env.FileManager.unzip = async (_, destination) => {
    destinations.push(destination)
    arrivals++
    if (arrivals === 2) resolveBothArrived()
    await unzipGate
  }
  const importBackup = env.callback("importBackup", {
    Date: FixedDate,
    DocumentPicker: { pickFiles: async () => [`/mock/backup-${pickerIndex++}.zip`] },
    BACKUP_MANIFEST_NAMES: [],
    folders: [], favorites: [], makeRowId: () => `import-${idCounter++}`,
    setFolders: () => assert.fail("Empty archives must not change folders"),
    setFavorites: () => assert.fail("Empty archives must not change favorites"),
  })

  const first = importBackup()
  const second = importBackup()
  await bothArrived
  releaseUnzip()
  await Promise.all([first, second])

  assert.equal(destinations.length, 2)
  assert.notEqual(destinations[0], destinations[1])
})

test("iOS ZIP import rejects unsafe metadata without changing existing data", async () => {
  const env = sandbox()
  const target = "/mock/icloud/BarcodeGenerator/folders.json"
  env.files.set(target, '["保留"]')
  env.FileManager.unzip = async (_, destination) => {
    env.directories.add(`${destination}/favorites`)
    env.files.set(`${destination}/favorites/valid.json`, JSON.stringify(favorite()))
    env.files.set(`${destination}/favorites/record.json`, JSON.stringify(favorite({ id: "folders", folder: ".." })))
  }
  await env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => ["/mock/incoming.zip"] },
    BACKUP_MANIFEST_NAMES: ["barcode-generator-backup.json", "barcode-generator-backup-android.json"],
    folders: ["保留"], favorites: [], makeRowId: () => "generated",
    setFolders: () => assert.fail("Invalid import changed folder state"),
    setFavorites: () => assert.fail("Invalid import changed favorite state"),
  })()
  assert.equal(env.files.get(target), '["保留"]')
  assert.equal(env.values.size, 0)
  assert.equal(env.messages[0].title, "备份导入失败")
})

test("iOS ZIP validates raw metadata before normalization can truncate it", async () => {
  const env = sandbox()
  env.FileManager.unzip = async (_, destination) => {
    env.directories.add(`${destination}/favorites`)
    env.files.set(`${destination}/favorites/record.json`, JSON.stringify(favorite({ folder: "工作/客户/../escape" })))
  }
  await env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => ["/mock/incoming.zip"] },
    BACKUP_MANIFEST_NAMES: [], folders: [], favorites: [], makeRowId: () => "generated",
    setFolders: () => assert.fail("Invalid import changed folder state"),
    setFavorites: () => assert.fail("Invalid import changed favorite state"),
  })()
  assert.equal(env.values.size, 0)
  assert.equal(env.messages[0].title, "备份导入失败")
})

test("backup import rejects over-deep folder paths instead of truncating or skipping them", async () => {
  const cases = [
    {
      name: "favorite metadata deeper than the supported folder depth",
      populate: (env, destination) => {
        env.directories.add(`${destination}/favorites`)
        env.files.set(`${destination}/favorites/record.json`, JSON.stringify(favorite({ folder: "A/B/C" })))
      },
    },
    {
      name: "favorite stored below an over-deep archive path",
      populate: (env, destination) => {
        env.directories.add(`${destination}/favorites/A/B/C`)
        env.files.set(`${destination}/favorites/A/B/C/record.json`, JSON.stringify(favorite({ folder: "A/B" })))
      },
    },
    {
      name: "over-deep directory alongside otherwise valid data",
      populate: (env, destination) => {
        env.directories.add(`${destination}/favorites/A/B/C`)
        env.directories.add(`${destination}/favorites`)
        env.files.set(`${destination}/favorites/valid.json`, JSON.stringify(favorite()))
      },
    },
  ]

  for (const scenario of cases) {
    const env = sandbox()
    env.FileManager.unzip = async (_, destination) => scenario.populate(env, destination)
    await env.callback("importBackup", {
      DocumentPicker: { pickFiles: async () => ["/mock/incoming.zip"] },
      BACKUP_MANIFEST_NAMES: [], folders: [], favorites: [], makeRowId: () => "generated",
      setFolders: () => assert.fail(`${scenario.name} changed folder state`),
      setFavorites: () => assert.fail(`${scenario.name} changed favorite state`),
    })()
    assert.equal(env.values.size, 0, scenario.name)
    assert.equal(env.messages[0].title, "备份导入失败", scenario.name)
  }
})

test("valid iOS ZIP import still merges favorites and empty folders", async () => {
  const env = sandbox()
  let savedFavorites, savedFolders
  env.FileManager.unzip = async (_, destination) => {
    env.directories.add(`${destination}/favorites`)
    env.directories.add(`${destination}/favorites/工作`)
    env.directories.add(`${destination}/favorites/工作/客户`)
    env.directories.add(`${destination}/favorites/空文件夹`)
    env.files.set(`${destination}/favorites/工作/客户/one.json`, JSON.stringify(favorite()))
  }
  await env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => ["/mock/incoming.zip"] },
    BACKUP_MANIFEST_NAMES: [], folders: ["已有"], favorites: [], makeRowId: () => "generated",
    setFolders: (value) => savedFolders = plain(value),
    setFavorites: (value) => savedFavorites = plain(value),
  })()
  assert.deepEqual(savedFavorites, [favorite()])
  assert.deepEqual(savedFolders, ["已有", "工作", "工作/客户", "空文件夹"])
})

test("backup import reports malformed favorite files among skipped records", async () => {
  const env = sandbox()
  env.FileManager.unzip = async (_, destination) => {
    env.directories.add(`${destination}/favorites`)
    env.files.set(`${destination}/favorites/valid.json`, JSON.stringify(favorite({ id: "valid", name: "有效收藏", folder: "" })))
    env.files.set(`${destination}/favorites/broken.json`, "{ invalid json")
    env.files.set(`${destination}/unrelated.json`, "{ ignored outside favorites }")
  }

  await env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => ["/mock/incoming.zip"] },
    BACKUP_MANIFEST_NAMES: [], folders: [], favorites: [], makeRowId: () => "generated",
    setFolders: () => {}, setFavorites: () => {},
  })()

  assert.equal(env.storage.loadFavorites().length, 1)
  assert.equal(env.messages.length, 1)
  assert.match(env.messages[0], /跳过 1 条/)
})

test("backup import rejects an archive with only malformed favorite files", async () => {
  const env = sandbox()
  env.FileManager.unzip = async (_, destination) => {
    env.directories.add(`${destination}/favorites`)
    env.files.set(`${destination}/favorites/broken.json`, "{ invalid json")
  }

  await env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => ["/mock/incoming.zip"] },
    BACKUP_MANIFEST_NAMES: [], folders: [], favorites: [],
    setFolders: () => assert.fail("Invalid-only archive changed folders"),
    setFavorites: () => assert.fail("Invalid-only archive changed favorites"),
  })()

  assert.equal(env.values.size, 0)
  assert.equal(env.messages[0].title, "备份导入失败")
})

test("backup import rejects same-count stale folder contents and restores prior favorites", async () => {
  const env = sandbox()
  const folderIndex = "/mock/icloud/BarcodeGenerator/folders.json"
  const currentFolders = ["A", "新"]
  const staleFolders = ["A", "旧"]
  const existingFavorite = favorite({ id: "existing", name: "现有", folder: "" })
  const importedFavorite = favorite({ id: "incoming", name: "导入", folder: "" })
  env.storage.saveFolders(staleFolders)
  env.storage.saveFavorites([existingFavorite])
  env.values.set("local:favorite_folders", currentFolders)
  env.values.set("shared:favorite_folders", currentFolders)
  const write = env.FileManager.writeAsStringSync
  env.FileManager.writeAsStringSync = (file, text) => {
    if (normalize(file) === folderIndex) throw new Error("simulated folder index write failure")
    write(file, text)
  }
  env.FileManager.unzip = async (_, destination) => {
    env.directories.add(`${destination}/favorites`)
    env.files.set(`${destination}/favorites/incoming.json`, JSON.stringify(importedFavorite))
  }
  let stateFolders
  let stateFavorites
  await env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => ["/mock/incoming.zip"] },
    BACKUP_MANIFEST_NAMES: [], folders: currentFolders, favorites: [existingFavorite],
    makeRowId: () => "generated",
    setFolders: (value) => { stateFolders = value },
    setFavorites: (value) => { stateFavorites = value },
  })()

  assert.equal(stateFolders, undefined)
  assert.equal(stateFavorites, undefined)
  assert.deepEqual(plain(env.values.get("local:favorite_folders")), currentFolders)
  assert.deepEqual(plain(env.storage.loadFavorites()), [existingFavorite])
  assert.deepEqual(JSON.parse(env.files.get(folderIndex)), staleFolders)
  assert.equal(env.messages[0].title, "备份导入失败")
})

test("backup import rejects same-count changed favorite content and restores the previous list", async () => {
  const env = sandbox()
  const existingFavorite = favorite({ id: "existing", name: "现有", folder: "" })
  const importedFavorite = favorite({ id: "incoming", name: "导入", folder: "" })
  env.storage.saveFolders([])
  env.storage.saveFavorites([existingFavorite])
  const setValue = env.values.set.bind(env.values)
  env.values.set = (key, value) => {
    if (key.endsWith(":favorites") && Array.isArray(value) && value.some((item) => item.id === "incoming")) {
      value = value.map((item) => item.id === "incoming" ? { ...item, name: "损坏" } : item)
    }
    setValue(key, value)
  }
  env.FileManager.unzip = async (_, destination) => {
    env.directories.add(`${destination}/favorites`)
    env.files.set(`${destination}/favorites/incoming.json`, JSON.stringify(importedFavorite))
  }
  let stateFavorites
  await env.callback("importBackup", {
    DocumentPicker: { pickFiles: async () => ["/mock/incoming.zip"] },
    BACKUP_MANIFEST_NAMES: [], folders: [], favorites: [existingFavorite],
    makeRowId: () => "generated",
    setFolders: () => {},
    setFavorites: (value) => { stateFavorites = value },
  })()

  assert.equal(stateFavorites, undefined)
  assert.deepEqual(plain(env.storage.loadFavorites()), [existingFavorite])
  assert.equal(env.files.has("/mock/icloud/BarcodeGenerator/favorites/incoming.json"), false)
  assert.equal(env.messages[0].title, "备份导入失败")
})

test("valid export retains the folder ZIP layout and favorite JSON", async () => {
  const env = sandbox()
  let archiveFiles, archiveDirectories, exported = false
  env.FileManager.zip = async (source, destination) => {
    archiveFiles = [...env.files].filter(([name]) => name.startsWith(`${source}/`)).map(([name, text]) => [name.slice(source.length + 1), JSON.parse(text)])
    archiveDirectories = [...env.directories].filter((name) => name.startsWith(`${source}/`)).map((name) => name.slice(source.length + 1))
    env.files.set(destination, "virtual ZIP")
  }
  await env.callback("exportBackup", {
    folders: ["工作", "工作/客户", "空文件夹"], favorites: [favorite()],
    makeRowId: () => "export",
    Data: { fromFile: () => "virtual ZIP data" },
    DocumentPicker: { exportFiles: async () => { exported = true; return ["/mock/export.zip"] } },
  })()
  assert.equal(exported, true)
  assert.deepEqual(archiveFiles, [["favorites/工作/客户/one.json", favorite()]])
  assert.ok(archiveDirectories.includes("favorites/空文件夹"))
  assert.equal(env.messages[0].title, "导出完成")
})

test("concurrent backup exports use separate temporary paths", async () => {
  const env = sandbox()
  const roots = []
  const archives = []
  let id = 0
  let arrivals = 0
  let releaseZip
  let resolveBothArrived
  const zipGate = new Promise((resolve) => { releaseZip = resolve })
  const bothArrived = new Promise((resolve) => { resolveBothArrived = resolve })
  class FixedDate extends Date { static now() { return 123456789 } }
  const createDirectorySync = env.FileManager.createDirectorySync
  env.FileManager.createDirectorySync = (directory, recursive) => {
    createDirectorySync(directory, recursive)
    let current = normalize(directory)
    while (current !== "/") {
      env.directories.add(current)
      current = path.posix.dirname(current)
    }
  }
  env.FileManager.zip = async (source, destination) => {
    roots.push(source)
    archives.push(destination)
    arrivals++
    if (arrivals === 2) resolveBothArrived()
    await zipGate
    env.files.set(destination, "virtual ZIP")
  }
  const exportBackup = env.callback("exportBackup", {
    Date: FixedDate,
    makeRowId: () => `export-${id++}`,
    folders: ["A"], favorites: [favorite({ folder: "A" })],
    Data: { fromFile: () => "virtual ZIP data" },
    DocumentPicker: { exportFiles: async () => ["/mock/export.zip"] },
  })

  const first = exportBackup()
  const second = exportBackup()
  await bothArrived
  releaseZip()
  await Promise.all([first, second])

  assert.equal(new Set(roots).size, 2)
  assert.equal(new Set(archives).size, 2)
  assert.equal(env.messages.filter((message) => message.title === "导出完成").length, 2)
  assert.equal([...env.directories].some((directory) => directory.startsWith("/mock/tmp/barcode-generator-backup-")), false)
  assert.equal([...env.files.keys()].some((filename) => filename.startsWith("/mock/tmp/barcode-generator-backup-")), false)
})
