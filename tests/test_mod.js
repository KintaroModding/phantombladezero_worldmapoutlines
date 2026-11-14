// Offline test of the mod, run by build.ps1: node tests/test_mod.js
// It loads src/phantombladezero_worldmapoutlines/main.js as PBZModLoader does (a module whose __dirname is the mod's
// folder) with stand-ins for the modules the game gives it (ue, puerts, and the game's UI/Widget/Map module whose
// MapInterface the mod wraps) and a small game: the world map widget with its BigMapGadget canvas, the bell manager with
// the activated bells and their maps, the texture maker, an optional running Mods Menu and the settings file. It calls
// the wrapped UpdateBigMapGadgetIcon the way the game does each frame and checks the outlines, the textures made from the
// images inside main.js (byte for byte the PNGs in assets/), the settings, stop() and a second copy after it.
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const FOLDER = path.join(__dirname, "..", "src", "phantombladezero_worldmapoutlines");
const SCRIPT = path.join(FOLDER, "main.js");
const ASSETS = path.join(__dirname, "..", "assets");
const SETTINGS = path.join(FOLDER, "phantombladezero_worldmapoutlines.txt");
const SETTINGS_PATH = FOLDER.replace(/[\\/]+$/, "") + "/phantombladezero_worldmapoutlines.txt";
const MENU_PATH = "C:/Game/ProjectPBZ/Saved/PBZModsMenu/Settings/phantombladezero_worldmapoutlines.txt";
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "mod.json"), "utf8")).version;
const VIS = { Visible: 0, Collapsed: 1, Hidden: 2, HitTestInvisible: 3, SelfHitTestInvisible: 4 };
const REGIONS = ["xigu", "fujizhilin", "lujiacun", "zhengdaodaying", "dengdingshandao", "duanhunya", "meiguhu", "pangzhen"];
// SHA-256 of the eight outline PNGs (the private project's assets/, not published): the test finds each image that
// main.js gives the game by its hash, so it runs from the public repository too. With assets/ there, the table must
// equal the files.
const IMAGE_SHA256 = {
    dengdingshandao: "746221341f5cbc45b9a46a02464591a23a2ef58b88c7862bb985143ee07c2ce6",
    duanhunya: "f253e188c1aab55c7fb3af41581b2ee570499ce0231232c6ae23aa2dff477985",
    fujizhilin: "99e578c213b1a19207cc0fbed6cce532d5fb1ff10c6bb035bd0cf7e536062e84",
    lujiacun: "0b8804dbdf543fadf2f740ea88d1a0a894b943bdcfbeb954350c0617fc9ad66f",
    meiguhu: "a6dcefbf773706699adfbd3f11c8b7aa6b3256882bd76965bcac18685a68f4f5",
    pangzhen: "70117235ceea89f58a3ece4b48fbf6af5c866b47025d130620b3ecc95a5aeffd",
    xigu: "c7e2062b1ec02e2c876511aef44ca5250c3c80e5ae29f7743bfa75f2dc7089ca",
    zhengdaodaying: "f99c5e8cd111f82f2d85e3ab449dffc35908f11985f52a938fdc89b77be68745",
};
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
if (fs.existsSync(ASSETS)) {
    for (const r of REGIONS) {
        if (sha256(fs.readFileSync(path.join(ASSETS, r + ".png"))) !== IMAGE_SHA256[r]) {
            throw new Error("IMAGE_SHA256 of " + r + " does not match assets/" + r + ".png");
        }
    }
}

let failed = 0;
function check(name, ok) {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
    if (!ok) {
        failed++;
    }
}
function tarray(items = []) {
    const a = { items };
    a.Num = () => a.items.length;
    a.Get = (i) => a.items[i];
    a.Add = (v) => { a.items.push(v); };
    return a;
}

// The game: the bells and their maps, the textures it made. It stays across copies of the mod.
function newGame() {
    const game = { bells: ["Bell_XG_01", "Bell_XG_02", "None", "Bell_LJC_01", "Bell_Test"], dataCalls: 0, imported: [],
        maps: { Bell_XG_01: "xigu", Bell_XG_02: "XiGu", Bell_LJC_01: "LuJiaCun", Bell_Test: "testmap", Bell_MGH_01: "meiguhu" } };
    game.manager = { path: "/World.BellManager" };
    Object.defineProperty(game.manager, "ActivateBellIDs", { get: () => { game.bellReads = (game.bellReads || 0) + 1; return tarray(game.bells.slice()); } });
    game.canvas = newCanvas("BigMapGadget_0");
    game.host = { path: "/UI.WB_MapNew_C_0", BigMapMode: true, BigMapGadget: game.canvas, WidgetTree: { path: "/UI.WidgetTree" } };
    return game;
}
function newCanvas(name) {
    const canvas = { path: "/UI." + name, children: [] };
    canvas.AddChildToCanvas = (image) => {
        canvas.children.push(image);
        image.parent = canvas;
        const slot = { image };
        slot.SetAutoSize = (v) => { slot.auto = v; };
        slot.SetAnchors = (a) => { slot.anchors = [a.Minimum.X, a.Minimum.Y, a.Maximum.X, a.Maximum.Y]; };
        slot.SetOffsets = (m) => { slot.offsets = [m.Left, m.Top, m.Right, m.Bottom]; };
        slot.SetZOrder = (z) => { slot.z = z; };
        image.slot = slot;
        return slot;
    };
    return canvas;
}
// the outlines on a canvas: region -> its image (the texture's region names it)
const outlines = (canvas) => Object.fromEntries(canvas.children.map((i) => [i.texture.region, i]));
const visible = (canvas) => canvas.children.filter((i) => i.visibility === VIS.HitTestInvisible).map((i) => i.texture.region).sort().join();

function boot(options = {}) {
    const game = options.game || newGame();
    const w = { game, now: 1000000, files: new Map(), saved: [], warnings: [], logs: [], pushed: [], loadError: undefined, mapCalls: 0 };
    for (const [file, text] of Object.entries(options.files || {})) {
        w.files.set(file, text);
    }
    const MapModule = options.mapModule || (() => {
        const C = class { };
        C.prototype.UpdateBigMapGadgetIcon = function () { w.mapCalls++; return "original"; };
        C.original = C.prototype.UpdateBigMapGadgetIcon;
        return { MapInterface: C };
    })();
    w.mapModule = MapModule;
    const gameInstance = { path: "/Engine/Transient.GameInstance" };
    class Vector2D { constructor(x, y) { this.X = x; this.Y = y; } }
    const ue = {
        KismetSystemLibrary: { IsValid: (o) => !!o && o.valid !== false, ConvertToAbsolutePath: (p) => p },
        BlueprintPathsLibrary: { FileExists: (p) => w.files.has(p) },
        EasyCsv: {
            LoadStringFromLocalFile(p, out) { out[0] = w.files.get(p); return true; },
            SaveStringToFileWithFullPath(text, p) { w.saved.push([p, text]); w.files.set(p, text); return true; },
        },
        ESlateVisibility: VIS,
        Image: { StaticClass: () => "Image" },
        NewObject: (cls, outer) => {
            const image = { outer, visibility: VIS.Visible, opacity: 1 };
            image.SetVisibility = (v) => { image.visibility = v; };
            image.GetVisibility = () => image.visibility;
            image.SetBrushFromTexture = (t) => { image.texture = t; };
            image.SetRenderOpacity = (o) => { image.opacity = o; };
            image.GetRenderOpacity = () => image.opacity;
            image.RemoveFromParent = () => { if (image.parent) image.parent.children = image.parent.children.filter((i) => i !== image); image.parent = null; image.valid = false; };
            return image;
        },
        Anchors: class { },
        Vector2D,
        Margin: class { constructor(l, t, r, b) { Object.assign(this, { Left: l, Top: t, Right: r, Bottom: b }); } },
        BuiltinByte: 1,
        NewArray: () => tarray([]),
        KismetRenderingLibrary: { ImportBufferAsTexture2D: (ctx, buffer) => {
            const bytes = Buffer.from(buffer.items);
            const hash = sha256(bytes);
            const region = REGIONS.find((r) => IMAGE_SHA256[r] === hash) || "?";
            const tex = { path: "/Engine/Transient.Texture2D_" + game.imported.length, region, bytes };
            game.imported.push(tex);
            return tex;
        } },
        SubsystemBlueprintLibrary: { GetWorldSubsystem: () => game.manager },
        BellManager: { StaticClass: () => "BellManager", GetBellData: (id) => { game.dataCalls++; return game.maps[id] ? { MapID: game.maps[id] } : undefined; } },
    };
    const puerts = {
        $ref: (value) => [value],
        $unref: (box) => box[0],
        argv: { getByName: (name) => (name == "GameInstance" && !options.noGameInstance ? gameInstance : undefined) },
    };
    const stubs = { "ue": ue, "puerts": puerts, "Library/TsHelper": { default: {} }, "UI/Widget/Map": MapModule };
    const load = Module._load;
    const hooked = function (request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return load.call(this, request, parent, isMain);
    };
    const realNow = Date.now, realWarn = console.warn, realLog = console.log;
    const enter = () => {
        Module._load = hooked;
        Date.now = () => w.now;
        console.warn = (message) => w.warnings.push(String(message));
        console.log = (message) => w.logs.push(String(message));
    };
    const leave = () => {
        Module._load = load;
        Date.now = realNow;
        console.warn = realWarn;
        console.log = realLog;
    };
    w.timersMade = 0;
    globalThis.setInterval = () => { w.timersMade++; return 1; };
    globalThis.clearInterval = () => { };
    globalThis.PBZModsMenu = options.menu === "array" ? [] : options.menu ? {
        api: { has: (f) => !(options.menuMissing || []).includes(f) },
        push(...mods) { w.pushed.push(...mods); return w.pushed.length; },
        settingsPath: (id) => (w.pushed.some((m) => m.id == id) ? MENU_PATH : undefined),
    } : undefined;
    w.menuGlobal = globalThis.PBZModsMenu;
    delete require.cache[require.resolve(SCRIPT)];
    enter();
    try {
        w.exports = require(SCRIPT);
    }
    catch (e) {
        w.loadError = e;
    }
    finally {
        leave();
    }
    // `count` world map frames of 16 ms each: the game calls the map's UpdateBigMapGadgetIcon on its widget; with
    // game.kept set, it calls the function it kept when it mixed the class (as the game did after Alt+F5)
    w.frames = (count = 1, host = game.host) => {
        for (let i = 0; i < count; i++) {
            w.now += 16;
            enter();
            try {
                (game.kept || MapModule.MapInterface.prototype.UpdateBigMapGadgetIcon).call(host);
            }
            finally {
                leave();
            }
        }
    };
    w.wait = (ms) => { w.now += ms; };
    w.stop = () => {
        enter();
        try {
            w.exports.stop();
        }
        finally {
            leave();
        }
    };
    return w;
}

// The module as PBZModLoader loads it.
{
    const w = boot();
    check("no error at load; stop() exported; no timer (the map's own frames drive it)", !w.loadError
        && typeof w.exports.stop == "function" && w.timersMade == 0);
    check("one start line for loader.log, naming the settings file in the mod's folder",
        w.logs.length == 1 && w.logs[0] == `[PBZMOD] [World Map Outlines] ${VERSION} started; settings: ${SETTINGS_PATH}`);
    check("the map's UpdateBigMapGadgetIcon is wrapped (no game script replaced)",
        w.mapModule.MapInterface.prototype.UpdateBigMapGadgetIcon !== w.mapModule.MapInterface.original);
    check("no Mods Menu: no page pushed anywhere", globalThis.PBZModsMenu === undefined && w.pushed.length == 0);
    const text = fs.readFileSync(SCRIPT, "utf8");
    check("main.js holds all eight images (no image file in the mod folder)", REGIONS.every((r) => text.includes(`"${r}": "iVBORw0KGgo`))
        && !fs.readdirSync(FOLDER).some((f) => /\.png$/i.test(f)));
}

// The outlines.
{
    const w = boot();
    const { game } = w;
    game.host.BigMapMode = false;
    w.frames(3);
    check("not on the world map (a region map): the game's own method runs, no outline", w.mapCalls == 3
        && game.canvas.children.length == 0);
    game.host.BigMapMode = true;
    w.frames();
    const o = outlines(game.canvas);
    check("the world map: one outline per discovered region (xigu from two bells, MapID in any case; lujiacun); "
        + "no outline for None or a map without an image", Object.keys(o).sort().join() == "lujiacun,xigu" && visible(game.canvas) == "lujiacun,xigu");
    check("each texture is made in memory from main.js, byte for byte one of the eight outline PNGs (SHA-256)", game.imported.length == 2
        && game.imported.every((t) => t.region !== "?"));
    const x = o.xigu.slot;
    check("the xigu outline: anchored to its box (follows pan and zoom), no offsets, below the fog (ZOrder -1), not in the cursor's way",
        x.anchors.join() == "0.45240761478163494,0.724609375,0.5856662933930571,0.927734375" && x.offsets.join() == "0,0,0,0"
        && x.z === -1 && x.auto === false && o.xigu.visibility === VIS.HitTestInvisible && o.xigu.outer === game.host.WidgetTree);
    check("a missing settings file is written once with the defaults; the shipped file is exactly that text (CRLF)",
        w.saved.length == 1 && w.saved[0][0] == SETTINGS_PATH && w.saved[0][1] == fs.readFileSync(SETTINGS, "utf8")
        && fs.readFileSync(SETTINGS, "utf8").includes("\r\n"));
    const reads = game.bellReads, data = game.dataCalls;
    w.frames(10); // 160 ms
    check("within 250 ms the bells are not read again", game.bellReads == reads);
    game.bells.push("Bell_MGH_01");
    w.frames(10);
    check("a bell activated later: its region's outline appears within 250 ms; a bell's map is asked once",
        visible(game.canvas) == "lujiacun,meiguhu,xigu" && game.dataCalls == data + 1 && game.canvas.children.length == 3);
    game.bells = game.bells.filter((b) => b != "Bell_LJC_01");
    w.frames(20);
    check("a region no longer discovered (a new game): its outline collapses", visible(game.canvas) == "meiguhu,xigu"
        && outlines(game.canvas).lujiacun.visibility === VIS.Collapsed);
    check("the log names the count; no warning", w.logs.some((l) => l.includes("3 of 8 regions outlined")) && w.warnings.length == 0);
}

// Settings, a new canvas, textures made once.
{
    const w = boot({ files: { [require("path").posix.join(SETTINGS_PATH)]: "Opacity=0,5\r\n" } });
    const { game } = w;
    w.frames();
    check("Opacity=0,5 (a comma works too): every outline at 0.5", game.canvas.children.every((i) => i.opacity === 0.5));
    w.files.set(SETTINGS_PATH, "Opacity=7\r\n");
    w.wait(2000);
    w.frames(16);
    check("Opacity=7 (live): kept within 0.1 to 1", game.canvas.children.every((i) => i.opacity === 1));
    w.files.set(SETTINGS_PATH, "Enable=Off\r\n");
    w.wait(2000);
    w.frames(16);
    check("Enable=Off (live): every outline removed from the map", game.canvas.children.length == 0);
    w.files.set(SETTINGS_PATH, "Enable=On\r\n");
    w.wait(2000);
    w.frames(16);
    check("Enable=On again: the outlines are back, the textures made before are used again",
        visible(game.canvas) == "lujiacun,xigu" && game.imported.length == 2);
    const old = game.canvas;
    game.canvas = game.host.BigMapGadget = newCanvas("BigMapGadget_1");
    w.frames(16);
    check("the game builds its canvas anew: the old outlines are removed, new ones on the new canvas",
        old.children.length == 0 && visible(game.canvas) == "lujiacun,xigu" && game.imported.length == 2);
    check("no warning", w.warnings.length == 0);
}

// stop(), and a second copy after it (PBZModLoader's reload).
{
    const game = newGame();
    const w = boot({ game });
    w.frames();
    w.stop();
    check("stop(): every outline removed, the game's own method back, a line for loader.log, no warning",
        game.canvas.children.length == 0 && w.mapModule.MapInterface.prototype.UpdateBigMapGadgetIcon === w.mapModule.MapInterface.original
        && w.logs[w.logs.length - 1] == "[PBZMOD] [World Map Outlines] stopped" && w.warnings.length == 0);
    const again = boot({ game, mapModule: w.mapModule });
    again.frames();
    check("a second copy after stop() (the reload): wraps once more and draws the outlines again",
        !again.loadError && visible(game.canvas) == "lujiacun,xigu" && game.canvas.children.length == 2);
    again.stop();
    check("... and its stop() removes them", game.canvas.children.length == 0);
}

// 1.1: the game keeps the function it took when it mixed the map class (the first game test: Alt+F5 lost the outlines).
{
    const game = newGame();
    const w = boot({ game });
    game.kept = w.mapModule.MapInterface.prototype.UpdateBigMapGadgetIcon; // mixed after the first copy wrapped
    w.frames();
    const before = visible(game.canvas);
    w.stop();
    const again = boot({ game, mapModule: w.mapModule });
    again.frames(2);
    check("1.1: after a reload the game still calls the first copy's wrapper: the outlines come back from the new copy",
        before == "lujiacun,xigu" && visible(game.canvas) == "lujiacun,xigu" && again.logs.some((l) => l.includes("2 of 8 regions outlined")));
    again.files.set(SETTINGS_PATH, "Enable=Off\r\n");
    again.wait(2000);
    again.frames(2);
    check("... and the new copy's settings work through it (Enable=Off removes them)", game.canvas.children.length == 0);
    again.files.set(SETTINGS_PATH, "Enable=On\r\n");
    again.wait(2000);
    again.frames(2);
    again.stop();
    const calls = again.mapCalls + w.mapCalls;
    again.frames(3);
    check("... after the last stop() the kept wrapper runs the game's own method only: no outline, no warning",
        game.canvas.children.length == 0 && again.warnings.length == 0 && w.mapCalls + again.mapCalls == calls + 3
        && globalThis.__worldMapOutlinesFrame === undefined);
}

// Mods Menu: optional.
{
    const m = boot({ menu: true, files: { [MENU_PATH]: "Opacity=0.3\r\n" } });
    const page = m.pushed[0];
    const keys = (text) => [...text.matchAll(/^(\w+)=/gm)].map((x) => x[1]).sort().join();
    check("Mods Menu running: one page with the mod's id, version, file, store \"saved\" and name",
        m.pushed.length == 1 && page.id == "phantombladezero_worldmapoutlines" && page.version == VERSION
        && page.file == "phantombladezero_worldmapoutlines.txt" && page.store == "saved" && page.title == "World Map Outlines");
    check("... its rows are the shipped file's settings, with the same defaults",
        page.settings.map((s) => s.key).sort().join() == keys(fs.readFileSync(SETTINGS, "utf8"))
        && page.settings.find((s) => s.key == "Opacity").default === 1);
    m.frames();
    check("... the mod reads the file the page saves (Opacity=0.3 there)",
        m.logs[0].endsWith(`settings: ${MENU_PATH} (Mods Menu's page)`) && m.game.canvas.children.every((i) => i.opacity === 0.3));
    const a = boot({ menu: "array" });
    check("Mods Menu not started yet (a plain array): nothing pushed, the mod's own file", a.menuGlobal.length == 0
        && a.logs[0].endsWith(`settings: ${SETTINGS_PATH}`));
    const o = boot({ menu: true, menuMissing: ["store.saved"] });
    check("an older Mods Menu without store \"saved\": no page", o.pushed.length == 0);
}

// A failed start.
{
    const n = boot({ noGameInstance: true });
    check("no GameInstance: the load throws (PBZModLoader logs the mod as failed), nothing wrapped",
        !!n.loadError && n.mapModule.MapInterface.prototype.UpdateBigMapGadgetIcon === n.mapModule.MapInterface.original);
    const C = class { };
    const b = boot({ mapModule: { MapInterface: C } });
    check("a game build without UpdateBigMapGadgetIcon: the load throws", !!b.loadError && /UpdateBigMapGadgetIcon/.test(String(b.loadError)));
}

process.exit(failed ? 1 : 0);
