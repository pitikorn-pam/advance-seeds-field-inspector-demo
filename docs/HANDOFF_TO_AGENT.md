Hand-off: Fix iOS build + continue wired-device QA

Summary

- Project: advance-seeds-field-inspector-demo (apps/mobile)
- Current blocker: Xcode build failing in Hermes pod script because Node binary path is missing.
- Key log: apps/mobile/.expo/xcodebuild.log contains "No such file or directory" for `/opt/homebrew/Cellar/node/25.8.1/bin/node`.

Context & recent work

- Metro dev server is running for `apps/mobile` (dev-client).
- Model-registry feature implemented with resumable downloads and cancel support; UI changes added in `apps/mobile/app/more/models.tsx` and installer changes in `apps/mobile/lib/models/modelRegistry.ts`.
- Analyzer startup logging and non-blocking registry probe added.

Blocking error (from Xcode log)

- Hermes script attempts to run Node at `/opt/homebrew/Cellar/node/25.8.1/bin/node` but the file is missing.
- Failing snippet: `.../Script-46EB2E0002A7C0.sh: line 9: /opt/homebrew/Cellar/node/25.8.1/bin/node: No such file or directory`
- Log location: apps/mobile/.expo/xcodebuild.log

Reproduction steps (what I did)

1. Start Metro in project root (if not running):

```bash
cd apps/mobile
pnpm expo start
```

2. Attempt device build (this reproduces the Hermes script failure):

```bash
pnpm expo run:ios --device
# or run from Xcode using the workspace at ios/*.xcworkspace
```

Suggested immediate remediation steps (try in this order)

1. Check current node location and version:

```bash
which node && node -v
ls -l /opt/homebrew/Cellar/node/25.8.1/bin/node || true
```

2. Quick workaround (symlink Node into expected path) — only if you have a compatible `node` installed:

```bash
sudo mkdir -p /opt/homebrew/Cellar/node/25.8.1/bin
sudo ln -s "$(which node)" /opt/homebrew/Cellar/node/25.8.1/bin/node
```

3. Preferred long-term fix: reinstall Node via Homebrew and reinstall CocoaPods:

```bash
brew reinstall node
cd apps/mobile/ios
pod deintegrate
pod install --repo-update
```

4. Clean Xcode derived data and rebuild:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/*
cd apps/mobile
pnpm expo run:ios --device
```

Files & places of interest

- Xcode build log: apps/mobile/.expo/xcodebuild.log
- Mobile app source: apps/mobile/
- Files changed by prior agent work: `apps/mobile/lib/models/modelRegistry.ts`, `apps/mobile/app/more/models.tsx`, analyzer files in `apps/mobile/lib/analyzer/`

Priority tasks for the next agent

1. Verify Node path and fix Hermes script failure (highest priority).
2. Rebuild and ensure `expo run:ios --device` completes and dev-client installs on device.
3. Run wired device QA: open app, More → Model registry, attempt download, cancel, activate, and run capture to validate analyzer behavior.
4. Replace textual download percent with progress bar and ETA in `apps/mobile/app/more/models.tsx` (UX follow-up).

Suggested prompt to give to the next agent

"You are an engineering agent. Goal: unblock iOS device builds for `apps/mobile` and complete wired-device QA for the model-registry feature.

Steps I expect you to perform:

- Inspect `apps/mobile/.expo/xcodebuild.log` and confirm the Hermes script failure path. Identify whether Node is missing or the script references a stale Homebrew Cellar path.
- If Node path is missing, prefer reinstalling Node via Homebrew and then running `pod install --repo-update` in `apps/mobile/ios`. If reinstall isn't possible, create a symlink from the existing `node` to the expected Cellar path as a temporary workaround.
- Clean CocoaPods and Xcode DerivedData, then rebuild with `pnpm expo run:ios --device`.
- Once the device build succeeds, run Metro, then exercise the Model registry screen and validate download progress, cancellation, and activation flows. Report any runtime errors or missing native hooks.
- Commit any small fixes (scripts, documentation) and report back with exact commands you ran, logs, and a short remediation summary."

Suggested message for me to paste to the agent (brief)

"Please fix the Hermes PhaseScriptExecution error in `apps/mobile` (xcode log shows missing Node at /opt/homebrew/Cellar/node/25.8.1/bin/node). Reinstall Node via Homebrew, run `pod install --repo-update`, clean DerivedData, and rebuild. Then verify model-registry download/cancel/activate flows on a wired iPhone. See apps/mobile/.expo/xcodebuild.log for failing details."
