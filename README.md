# TAMBO-4 monitoring

A buildless GitHub Pages dashboard for four detector panels. The acquisition computer runs `Multi_ch_analysis.py`; GitHub Pages serves only the dashboard and generated `data/` assets. The Python toolkit is intentionally local and excluded from this web repository, along with raw binaries, HDF5 files, analysis caches, test fixtures, and the watcher ledger.

## Run on the acquisition computer

Python 3.10+ is required. From the original workspace:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt

# Offline test: move timestamped directories into raw_data/ one at a time.
.venv/bin/python Multi_ch_analysis.py --watch raw_data --poll 10 --no-push

# Continuous analysis and automatic commit/push to origin/main.
.venv/bin/python Multi_ch_analysis.py --watch raw_data --poll 10 --branch main

# Optional receiver, with its output in the same raw directory.
.venv/bin/python Running_Receiver.py --output raw_data --chunk-size 600
```

Use an absolute path after `--watch` for an external raw data directory. Raw data must be outside the public `data/` tree. `--site-root` selects the Git repository containing the dashboard. `--once` performs one scan and exits, preserving the same completion rule. `--retry 60` controls failure retries. Stop the watcher with Ctrl+C. It does not run as a background service automatically.

Watch mode runs without Tkinter dialogs. Existing manual modes remain available, for example `-d /path/to/chunk --mode merged --start 1 --end 17 --plot-format html`. Manual analysis writes beside the raw data and does not publish. The old pickle module caches are no longer used because they could suppress regenerated plots or mix analysis contexts.

## Synchronized test without hardware

The local `sync_test_maker.py` helper copies one old acquisition's `.bin` files into three directories under `test_ready/`, starting at today's current minute in `America/Lima`, ten minutes apart. It preserves binary contents and filenames, gives the copies fresh modification times, and leaves the source untouched. Old caches and plots are not copied. The generated `pt100_sync.csv` has only `timestamp,celsius`, with UTC offsets and slight temperature variations between 25 and 26 °C. Its 31 one-minute readings cover first start minus five minutes through third start plus five minutes, inclusive.

```sh
.venv/bin/python sync_test_maker.py raw_data/261005_181106

# Optional: choose today's first acquisition time and repeatable temperatures.
.venv/bin/python sync_test_maker.py /path/to/old_data/261005_120000 \
  --start-time 12:00:00 --spacing-minutes 10 --seed 42
```

Run one example, then follow the exact watcher and move commands printed by the script. Stop an existing watcher first. Point `--temperature-source` directly at `pt100_sync.csv` so other sensor logs do not affect this test. Move only the first ready directory into `raw_data/`: it must wait. Move the second to release the first; after analysis, move the third to release the second. No real ten-minute waits are required. The third directory stays pending under N−1; the CSV covers the entire acquisition intervals of both analyzed datasets. The CSV is generated all at once; this tests synchronized plots and temperature loading, not timed sensor appends.

Use a watch directory with no newer datasets. Already-present older datasets can also be analyzed, and current timestamps trigger normal 24-hour plot pruning. The printed command uses `--no-push` for local testing; this still updates local `data/`. Preview with `.venv/bin/python -m http.server 8000`. To include GitHub publication, replace `--no-push` with `--branch main`. Match `CONFIG.chunkSizeSeconds` in `app.js` to `60 * --spacing-minutes` (default 600). Later folders and CSV samples naturally roll into the next day if the selected start is near midnight.

Outputs are never overwritten: for another run, choose an unused `--start-time` and a different `--temperature-csv` path, or move previous outputs aside. `--output-dir`, `--timezone`, and `--seed` are also configurable; run `--help` for details. The helper, ready binaries, and source CSV remain local and are excluded from the dashboard Git repository.

### Reset before another test

Run the local helper from the workspace (it also accepts `bash reset_test.sh`):

```sh
sh reset_test.sh
```

The script stops your user's running `Multi_ch_analysis.py` Python processes with SIGTERM and waits for them to exit, removes `.tambo-state/`, empties `data/plots/` while keeping the directory, writes `[]` to `data/history_index.json`, and sets all four panels to Waiting. It then stages only `data/`, commits with `Reset test environment`, and pushes to `origin main`. GitHub Pages clears the plot history after deployment and the dashboard's next refresh; this is not instantaneous. Terminal messages use colors when connected to a terminal.

Run on `main` with Git authentication configured and no unrelated staged changes. If push fails, the local reset remains committed: fix the reported Git error and retry `git push origin main` or rerun the helper. An already-committed reset skips the empty commit and still pushes. If an analysis process does not exit within ten seconds, cleanup stops before deleting state.

Raw datasets, `test_ready/`, source temperature CSVs, `data/temperature.json`, and shared Plotly assets are retained. Move previous datasets out of the watched directory before the next test: clearing the ledger makes them eligible for analysis again. The reset helper stays local, like the Python acquisition toolkit.

## Completion and analysis

Only valid calendar timestamps in `yymmdd_hhmmss` directory names are considered (years 2000–2099). Directories are sorted chronologically. Every directory except the newest is eligible, including when several arrive between scans. `.done` markers, modification times, and elapsed time never release the newest directory.

For example, `261006_092610` waits alone. Adding `261006_093610` releases `261006_092610`; the latter directory remains held. The final acquisition chunk stays held until a newer directory exists. For offline transfers, finish copying a directory before introducing its successor; the presence of a successor is the completion contract.

The binary loader preserves the existing format: little-endian 64-bit records, signed 16-bit ADC, 27-bit 8 ns counter, and 21-bit seconds counter. It decodes and reconstructs each channel once, then runs the existing scientific modules independently for each panel set. Baselines are reused; timing calibration is isolated per combination. The 16 ns reconstruction gap, 30-sample pretrigger cut, 24 ns coincidence window, and other scientific settings remain in `modules/`.

Outputs are:

```text
data/
  status.json
  temperature.json
  history_index.json
  assets/plotly-<version>.min.js
  plots/<yymmdd_hhmmss>/
    manifest.json
    A/*.html
    B/*.html
    C/*.html
    D/*.html
    A-B/*.html
    ...
    A-B-C-D/*.html
```

All 15 combinations appear in the manifest. The actual number of plots varies with event availability: coincidence, duration-selected waveform, and multipulse plots can be absent when there are no qualifying events. Coincidence membership in each multi-panel set requires all selected panels; lower-order pairs are used for calibration only. Multi-panel figures retain the modules' all-pulses versus coincident-pulses comparisons; subplot labels identify each included channel. Missing, empty, truncated, or insufficient-baseline panel data is explicitly unavailable, never replaced with fabricated plots.

A dataset is installed atomically after analysis succeeds. The private `.tambo-state/state.json` ledger survives restarts and remains after plots expire, preventing repeated analysis. Failures retry without becoming completed. A completed manifest allows recovery if the process crashes just before the ledger is saved. Only one watcher may use a state directory. Keep the state directory on the same filesystem as the site for atomic installation.

History and plot retention use an inclusive 24-hour interval relative to the **latest analyzed dataset timestamp**, not the computer clock. Raw data is never deleted. Directory timestamps use `--timezone America/Lima` by default; use the receiver's actual timezone if different.

## Status and temperature

Panel status describes observed file activity, not a direct hardware heartbeat:

- **Running:** a nonempty file in the newest directory was modified within `--active-seconds` (default 120).
- **Waiting:** no recent file activity, or no data yet.
- **Error:** the latest completed analysis has invalid panel data, or analysis failed and is pending retry.

The dashboard also shows the publication time; GitHub Pages cannot report live hardware state while the acquisition computer or publisher is offline. Static JSON is refreshed in the browser every 10 seconds. Each completed dataset requests publication immediately. Status-only commits are limited to once per `--publish-interval` (default 600 seconds).

The PT100 logger appends newline-terminated rows to a two-column CSV. No `sensor` column is required; all readings belong to the single **PT100** series:

```csv
timestamp,celsius
2026-10-12T17:45:56-05:00,25.4
2026-10-12T17:46:56-05:00,25.5
```

Connect either one file or a directory containing rotating logs:

```sh
# Follow one CSV (including the sample file in the acquisition workspace).
.venv/bin/python Multi_ch_analysis.py --watch raw_data --poll 10 --branch main \
  --temperature-source pt100_20261012_174554.csv

# Merge every pt100_*.csv log in a directory; newly created files are discovered automatically.
.venv/bin/python Multi_ch_analysis.py --watch raw_data --poll 10 --branch main \
  --temperature-source /path/to/pt100-logs
```

Restart an already-running watcher to load these changes, including `--temperature-source` in the new command. Editing the Python files does not reload a running process.

Each watch cycle reads the current source, even when there are no panel datasets or the newest panel directory is still waiting. Temperature is also checked before panel analysis and after each analyzed dataset. Panel analysis runs synchronously, so a long analysis can delay the next sensor check; `--poll` is the sleep between cycles, not a background timer during analysis.

Directory logs are merged in filename order (`pt100_YYYYMMDD_HHMMSS.csv`) and readings are sorted by their actual timestamps. Overlapping readings at the same instant are deduplicated, with the later file/row taking precedence. The output retains **every distinct reading in the inclusive 24 hours ending at the latest valid temperature timestamp in the source**. It does not use panel timestamps, previous JSON timestamps, or the computer clock. There is no downsampling; one-minute measurements retain up to 1,441 points including both endpoints. Re-reading the files handles restarts, rotation, truncation, and corrections without an offset cache.

A partially appended final line waits for its newline, so a value such as `25.4` cannot be published prematurely as `25`. Complete malformed rows are logged and skipped without blocking later valid readings. ISO timestamps must include a UTC offset or `Z`; Celsius values must be finite. Missing/unreadable sources preserve the last published values and mark the source unavailable. An empty source publishes an empty waiting series. Real readings replace mock readings completely. With no `--temperature-source`, the existing JSON remains unchanged. Legacy JSON input (`{"samples": [...]}` or a bare array of `timestamp,celsius` records) is still supported; any optional sensor labels are normalized to PT100.

The generated JSON keeps the dashboard schema:

```json
{
  "version": 1,
  "unit": "celsius",
  "source_state": "ready",
  "samples": [
    {"timestamp": "2026-10-12T22:45:56+00:00", "sensor": "PT100", "celsius": 25.4}
  ]
}
```

Changed temperature data requests a Git publication immediately, independently of panel completion and the status-only `--publish-interval`. Unchanged CSV data neither rewrites the JSON nor triggers another temperature publication. Failed pushes keep the existing retry behavior. GitHub Pages deployment and caching can add delay after a push; local scanning and browser polling do not bypass that hosting delay.

The dashboard fetches temperature JSON on every visible-page refresh (10 seconds by default), updates one existing SVG line, and animates new point coordinates without clearing the chart. Unchanged data does not redraw. Older points disappear when they leave the sensor's window; reduced-motion preferences disable animation. PT100 source CSV files stay local and are ignored by Git; only the generated JSON is published.

## Dashboard configuration

All dashboard English UI strings are in `EN` at the top of `app.js`. `CONFIG` immediately follows it and holds image paths, panel positions, colors, refresh interval, and timezone.

Place real images at `assets/logo.png` and `assets/satellite_map.png`, or edit those paths in `CONFIG`. Until then, the two SVG placeholders are used. Panel positions are percentage coordinates over the full displayed map image:

```js
panelPositions: { A: [50, 20], B: [25, 50], C: [75, 50], D: [50, 80] }
```

The temperature chart shades the entire selected dataset's acquisition interval and labels it `Selected: <dataset ID>`. Set `CONFIG.chunkSizeSeconds` (default `600`, or 10 minutes) to match the receiver's `--chunk-size`. The start comes from the timestamped directory name, using the manifest's explicit timezone offset when available and otherwise the manifest/configured timezone. The duration is elapsed seconds, including when a chunk crosses midnight or a timezone offset change.

Latest and historical selections update the band immediately, with the same transition duration and reduced-motion handling as the temperature line. The X-axis includes the full interval as well as the available temperature readings. If they do not overlap, the chart says that the selected period has no readings; sensor retention and measurements are unchanged. Expired or invalid dataset selections remove the band.

The current placement is a schematic, not surveyed geometry. Plot tabs list the actual manifest entries and scroll horizontally at any screen size. Selecting history preserves the panel combination and exact plot type. If that type is absent, the viewer explains its absence without silently switching plots. Latest follows newly published datasets; a selected historical dataset stays pinned until it expires.

Preview with `.venv/bin/python -m http.server 8000` and open `http://localhost:8000`. Use HTTP rather than opening `index.html` directly, because browsers restrict local JSON requests.

## GitHub Pages and publication

The target repository is `https://github.com/suhyeonKim222/tambo4-monitor`, branch `main`. Configure GitHub Pages to deploy from branch `main`, folder `/` (repository root). No build step or JavaScript dependencies are required. `.nojekyll` enables plain static assets. See [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The watcher requires an existing initial commit, Git author configuration, and working Git authentication. It stages only `data/`, rejects raw/cached/unexpected files in that tree, refuses unrelated staged changes, and never force-pushes, pulls, or changes branches. A failed push retries the existing commit without rerunning successful analysis. If another computer advances `main`, resolve the normal Git conflict on the acquisition machine, then let publication retry.

Plotly HTML files share one local versioned JavaScript bundle, using the [supported external bundle option](https://plotly.com/python-api-reference/generated/plotly.io.write_html.html). They need no third-party CDN. Expiration removes files from the current site, **not from Git history**. Long-running repositories still grow and must be monitored against [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits); history rewriting is not automated.

## Local verification

```sh
.venv/bin/python -m unittest discover -s tests -v
PYTHONPATH=. .venv/bin/python tests/synthetic_pipeline.py /tmp/tambo-test
# Optional browser checks (requires Playwright and Chrome):
PYTHONPATH=. .venv/bin/python tests/browser_temperature.py
PYTHONPATH=. .venv/bin/python tests/browser_reset.py
```

Tests cover N−1 completion, invalid names, restarts, panel retention, analysis retry, committed-but-unpushed recovery, and publication isolation. Temperature tests cover two-column CSVs, live appends without panel activity, sensor-relative retention, minute-by-minute point preservation, partial rows, rotating logs, overlapping timestamps, invalid rows, truncation, source failures, and replacement of mock data. The synthetic fixture runs the actual decoder and plotting modules for all 15 panel combinations. Keep synthetic outputs outside production `data/`.

Reset tests use temporary repositories and local bare remotes, with process discovery limited to test processes. They check shutdown before deletion, hidden plot cleanup, repeat runs, staged-change protection, symlinks, failed-push recovery, and restarting the watcher from `[]`. Browser reset checks cover clearing a loaded plot and selection band, preserving temperatures, and resuming Latest for the next run.
