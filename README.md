# World Map Outlines

The world map shows a soft outline around every region you have discovered, all the time, without moving the cursor over each one. A PBZModLoader mod; the outlines are inside the script, no image files; settings in a text file in its folder, or on its Mods Menu page.

A [PBZModLoader](https://github.com/KintaroModding/phantombladezero_pbzmodloader) mod for Phantom Blade Zero (Unreal Engine
5.7), made with game version `CL-302256_JKS-17280` and PBZModLoader 2.1.0. This README is for developers.
What the mod does, how to install it and its compatibility are in [openmods.md](openmods.md), the mod page on
[openmods](https://openmods.nexus).

## How it works

The game runs much of its logic in JavaScript (Puerts). PBZModLoader loads every folder in
`ProjectPBZ/PBZModLoader/mods/` that has a `main.js`, through the game's own module system, after the game's
`MainStart`; `require("ue")`, `require("puerts")` and `require("Library/TsHelper")` are the game's modules, and
`puerts.argv.getByName("GameInstance")` gives the game instance. Before a reload (Alt+F5) the loader awaits the mod's
`stop()`, which must give back everything the mod changed.

The game's map script `UI/Widget/Map.js` exports `MapInterface`, the mixin that `MainStart.js` mixes into the map
widget `WB_MapNew_C`. The mod requires the same module and wraps `MapInterface.prototype.UpdateBigMapGadgetIcon`, which
the game calls every frame while the world map shows (outside `BigMapMode` it returns at once, and so does the mod). No
timer, no search: the outlines are drawn from the map's own frames.

- **Discovered regions:** at most every 250 ms, the map's own rule: the bell manager's `ActivateBellIDs`
  (`SubsystemBlueprintLibrary.GetWorldSubsystem` with `BellManager`), each bell's `BellManager.GetBellData(id).MapID`
  in lower case (asked once per bell).
- **Outlines:** one `Image` per discovered region on the map's `BigMapGadget` canvas, made once and then shown or
  collapsed: anchored to the region's box (shares of the canvas, so it follows pan and zoom), no offsets, `ZOrder` -1
  (below the game's fog and markers), `HitTestInvisible`, `SetRenderOpacity(Opacity)`. A canvas the game builds anew
  gets new outlines.
- **No image files:** `main.js` holds the eight outlines as base64 PNG (`IMAGES`, written by
  `scripts/embed_images.py` from `assets/`). Each becomes a texture in memory once a session
  (`KismetRenderingLibrary.ImportBufferAsTexture2D` with a `TArray<BuiltinByte>`).

`stop()` removes every outline and the wrap. Nothing is written into the save.

The port (1.0) of the author's earlier UE4SS mod "TracedLands" 0.1.2: that mod searched the map widgets every 250 ms
(`FindAllOf` in a `LoopAsync`) and loaded the same eight images from loose PNG files in `ProjectPBZ/Content/Mods/`. The
region boxes and the images are that mod's. `reference/` holds its scripts and `assets/` its images (neither is
published).

1.1, after the first game test (the outlines worked, but not after Alt+F5): the game can keep calling the function it
took when it mixed the map class, so after the reload it went on calling the old copy's wrapper, which was stopped.
Now no wrapper belongs to one copy: each calls `globalThis.__worldMapOutlinesFrame`, which the running copy sets at
start and `stop()` deletes.

`tests/test_mod.js` runs the script in Node.js against a small stand-in game (33 checks); it also checks that the
images decoded from `main.js` are byte for byte the eight outline PNGs (by their SHA-256, a table in the test, so it
runs without `assets/`), and simulates a game that keeps the first copy's wrapper across a reload.

- **Settings file:** `phantombladezero_worldmapoutlines.txt` next to `main.js` (`__dirname`, the mod's folder as a full path), read every
  2 s while the world map shows, with `EasyCsv.LoadStringFromLocalFile`, and written with the defaults when missing. The shipped file is exactly the
  script's default text (`tests/test_mod.js` checks it).
- **Mods Menu, optional:** PBZModLoader starts its mods after Mods Menu's, so a running Mods Menu (0.9.0 or later) has
  its registry object in `globalThis.PBZModsMenu` by then. Only when it has the features `settingsPath` and
  `store.saved`, the mod pushes its page (id `phantombladezero_worldmapoutlines`, `store: "saved"`) and reads the file the page saves
  (`PBZModsMenu.settingsPath(id)`, in Mods Menu's Saved folder): a registered page cannot save anywhere else.
- **Log:** `console.log` lines that start with `[PBZMOD]` and the game's warnings reach `ProjectPBZ/PBZModLoader/loader.log`.

## Check and deploy

Requirements: Windows PowerShell 5.1 and [Node.js](https://nodejs.org/) (for `node --check` and the offline test).

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1             # node --check, tests\test_mod.js
powershell -ExecutionPolicy Bypass -File .\build.ps1 -Deploy     # the checks, then deploy.ps1
powershell -ExecutionPolicy Bypass -File .\deploy.ps1            # copy src\phantombladezero_worldmapoutlines to the game
```

`deploy.ps1` mirrors `src\phantombladezero_worldmapoutlines\` to `<game folder>\ProjectPBZ\PBZModLoader\mods\phantombladezero_worldmapoutlines\`. The
settings file that is already there is the tester's and stays; `-ResetConfig` copies the shipped one. The game folder
comes from `gameDir` in `_tools\gamedata\phantombladezero\game.json`, else `$env:UE5_GAMES_DIR\PBZ`; `-GameDir` or
`-ModsDir` override it. It stops when PBZModLoader is not installed (its start file
`ProjectPBZ\Content\JavaScript\PBZModLoader\bootstrap.js` is missing).

The GitHub release zip holds the mod folder at `ProjectPBZ/PBZModLoader/mods/phantombladezero_worldmapoutlines/`, so players unpack it
into the game folder.

Versioning: every change raises the second number in `mod.json` and `main.js` (1.0 -> 1.1): `python scripts\bump_version.py`.

## Project layout

```
src/phantombladezero_worldmapoutlines/   The mod folder: main.js and the shipped settings file
tests/test_mod.js     Offline test of main.js (Node.js, stand-ins for the game)
docs/                 Cover and screenshots
scripts/              bump_version.py, check_openmods.py, publish.ps1
build.ps1, deploy.ps1 Checks; copy into the game
mod.json              Name, version, game, kind pbzmodloader, modsPath
```

## License

MIT, see [LICENSE](LICENSE).
