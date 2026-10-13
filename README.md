# TAMBO-4 monitoring

A buildless GitHub Pages dashboard for four detector panels. The acquisition computer runs `Multi_ch_analysis.py`; GitHub Pages serves only the dashboard and generated `data/` assets. The Python toolkit is intentionally local and excluded from this web repository, along with raw binaries, HDF5 files, analysis caches, test fixtures, and the watcher ledger.

## Run on the acquisition computer

Python 3.10+ is required. From the original workspace:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt

# Continuous analysis and automatic commit/push to origin/main.
.venv/bin/python Multi_ch_analysis.py --watch raw_data --poll 10 --branch main

# Receiver: run in another terminal, with its output in the same raw directory.
.venv/bin/python Running_Receiver.py --output raw_data --chunk-size 600
```

Use an absolute path after `--watch` for an external raw data directory. Raw data must be outside the public `data/` tree. `--site-root` selects the Git repository containing the dashboard. `--once` performs one scan and exits, preserving the same completion rule. `--retry 60` controls failure retries. Stop the watcher with Ctrl+C. It does not run as a background service automatically.

Watch mode runs without Tkinter dialogs. Existing manual modes remain available, for example `-d /path/to/chunk --mode merged --start 1 --end 17 --plot-format html`. Manual analysis writes beside the raw data and does not publish. The old pickle module caches are no longer used because they could suppress regenerated plots or mix analysis contexts.

## Prepare the field computer

The Pages repository contains only the website. Alongside its `main` checkout, copy `Multi_ch_analysis.py`, `Running_Receiver.py`, `modules/`, `tambo_monitor/`, `requirements.txt`, and `clean_deploy.sh` from this workspace. These local toolkit files are ignored by Git and will not arrive with a clone. Create a new virtual environment on the field computer using the installation commands above; do not reuse this computer's `.venv/`. Configure Git author information and authentication for `origin` before the first publication.

Immediately before connecting the real hardware, run once from the workspace:

```sh
sh clean_deploy.sh
```

This permanently deletes `.tambo-state/` and everything inside `raw_data/` and `data/plots/`, while keeping the two empty directories. It first stops this user's analysis and receiver processes, including receiver workers, and waits for their exit. It resets history to `[]`, temperature to an empty Waiting series, and all four panels to Waiting. It stages only `data/`, commits as `Clean deployment state for hardware installation`, and pushes to `origin main`. GitHub Pages updates after deployment and the dashboard refreshes; the operation does not erase past Git commits.

Run on `main` with no unrelated staged changes. The script stops before deletion if a process cannot exit or immediately restarts; disable any service manager before running it. A failed push leaves the local reset committed: fix the Git error and retry `git push origin main` or rerun the script. Repeated runs skip empty commits and still retry publication. This resets the default workspace paths; any custom external raw/state directories or sensor log sources must be prepared separately.

Then connect the panels, start the receiver and watcher in separate terminals using the commands above, and point `--temperature-source` at a fresh real PT100 log file/directory. Keep the field computer's timezone (used by the receiver), the watcher's `--timezone`, and `CONFIG.timezone` consistent; the default is `America/Lima`. Match `CONFIG.chunkSizeSeconds` to the receiver's `--chunk-size` (default 600 seconds). The newest acquisition still waits for its successor under the N−1 rule.

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

History and plot retention use an inclusive 24-hour interval relative to the **latest analyzed dataset timestamp**, not the computer clock. The watcher never deletes raw data; `clean_deploy.sh` explicitly clears it during installation. Directory timestamps use `--timezone America/Lima` by default; use the receiver's actual timezone if different.

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
# Follow the CSV produced by your real PT100 logger.
.venv/bin/python Multi_ch_analysis.py --watch raw_data --poll 10 --branch main \
  --temperature-source /path/to/pt100-logs/pt100_current.csv

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
```

The retained regression tests cover N−1 completion, analysis retries, retention, PT100 appends, publication isolation, and restarting from an empty history. Deployment tests run only in temporary repositories with local bare remotes and process discovery restricted to test processes. They verify shutdown of both programs and receiver workers before deletion, raw/plot cleanup, all three JSON resets, repeat runs, staged-change and symlink protection, and failed-push recovery. Simulation generators, manual browser fixtures, and generated test assets have been removed from this field workspace.
