# Changelog

## v2.0.63

### Maintenance
- update Minecraft version list
- migrate package management from pnpm to Bun (#218)

## v2.0.62

### Features
- enforce verified artifacts and secure ngrok credentials
- make backup catalog authoritative
- add transactional full snapshot restore

### Bug Fixes
- harden real E2E diagnostics
- keep full snapshot creation authoritative
- constrain external import traversal
- enforce capability and managed import boundaries
- construct verified server jar checksums
- isolate E2E credential storage
- isolate OS credentials by app identifier
- harden catalog filesystem boundaries
- remove stale source reference from backup wrapper
- align full backup API and stabilize deletion tests
- refresh backup list after creation
- validate restore entries before filesystem access
- constrain restore verification to staging root
- keep legacy backup wrapper type-safe
- make backup archive paths analyzable

### Maintenance
- record provider canary limitation
- correct Rust verification count
- record expanded verification evidence
- expand real Tauri E2E coverage
- define verification and score gates
- define expanded real E2E responsibilities
- schedule native and provider E2E checks
- extend real Tauri coverage with deterministic fixtures
- refine ADR-006 platform setup
- isolate development bundle identifier
- pin GitHub Actions to commit SHAs
- add deterministic restore rollback failure injection
- add real Tauri backup restore smoke test
- define real Tauri E2E boundary
- define verified artifacts and secret storage
- format backup lifecycle assertions
- define catalog retention and recovery
- define full snapshot transactional restore
- add authoritative server operation boundary
- add ADR-001 operation boundary
- complete ADR hardening index
- establish ADR hardening index

## v2.0.61

### Bug Fixes
- stabilize selector indeterminate state
- confirm backup deletion before IPC
- keep manual backups running across view changes
- restore hierarchical backup target selection
- allow backup selector window close
- handle localized missing backup paths

### Maintenance
- remove unnecessary assets
- revise the prerequisites for development to ensure they are appropriate

## v2.0.6

### Features
- add EULA consent gate to first server start (#203)
- delete native app SPM

### Bug Fixes
- prevent duplicate backup view initialization
- treat missing backup catalog parents as empty
- apply retention to automatic backups
- align backup lifecycle with managed storage
- harden backup archive creation and restore
- notify Discord only for detected versions (#201)

### Maintenance
- align Rust formatting hooks
- cover backup catalog initialization boundaries
- update vitest and @vitest/ui to v5.0.0
- scope CI, E2E, Docs, and Release workflow triggers (#198)
- remove stale modal style hooks
- remove sass dependency and stale style classes
- migrate view styles to tailwind
- migrate app shell and modal styling
- normalize shared controls with tailwind variants
- make theme and base styles plain css
- move app styles from scss to css
- bump the all-npm-dependencies group across 1 directory with 55 updates (#197)
- delete Swift ci workflow

## v2.0.59

### Features
- add app-wide feedback policy and dialog
- add global hashless plugin download setting

### Bug Fixes
- make recursive file flows CodeQL-safe
- make picker and managed copy flows CodeQL-safe
- keep archive traversal on canonical paths
- make managed copy sinks explicit
- harden plugin download path boundaries
- keep managed backup paths typed
- make managed Java path tests portable
- guard managed filesystem sinks
- harden plugin download path data flow
- make managed path resolution CodeQL-safe
- make managed Java path test portable
- use supported cargo-audit invocation
- preserve structured plugin failure codes
- standardize plugin installation feedback
- use final plugin destinations for installs
- bound network and archive processing
- replace generic download and execution contracts
- enforce managed server and backup paths
- isolate Tauri filesystem capabilities
- clean up dark-theme UI inconsistencies in sidebar and settings

### Maintenance
- update Rust audit dependencies
- consolidate Playwright workflow commands
- stabilize Playwright CI execution
- verify shared feedback presentation
- cover plugin install feedback behavior
- cover application feature flows with Playwright
- move Playwright E2E into dedicated tests directory
- centralize Vitest tests under root tests
- cover plugin feedback behavior
- cover plugin downloads and managed placement
- harden CI supply chain checks
- add ignore pattern
- improve README overall
- bump sharp from 0.35.0 to 0.35.1 (#177)

## v2.0.58

### Bug Fixes
- stabilize Files editor and feedback UI (#179)
- harden server lifecycle and jar acquisition (#178)

### Maintenance
- add contribution and pull request guides (#180)

## v2.0.57

### Features
- Dashboard view with KPI cards and Swift Charts (task 5-4)
- TPSExtractor for Paper/LeafMC log parsing (task 5-3)
- ServerMetrics + ServerPerformanceService for 1Hz CPU/memory sampling (task 5-2)
- ServerProcessService PID, .online event, stdout broadcaster (task 5-1)
- Phase 4 — Navigation Shell + View Routing (native macOS) (#156)
- port security.rs authorization/rate-limit/path-safety/audit logic to Swift
- add Activity Drawer (task 3-10) for start/stop/crash history
- implement Floating Console Panel (task 3-9)
- implement live log-stream screen for native macOS server detail (task 3-8)
- add server process start/stop lifecycle (Task 3-7)
- add server detail pane (Inspector) to NavigationSplitView
- add server list sidebar screen and real app window (Task 3-5)
- add Server domain model and minimal servers.json store to Native app
- add high-frequency log stream spike + batching logic
- add NSPanel/WindowLevel glass spike scaffolding
- add hardened runtime Java launch spike harness
- add SwiftLint via SPM build tool plugin
- add SwiftFormat via SPM command plugin
- add placeholder RootView with #Preview
- scaffold apps/native-macos SwiftPM package
- add Liquid Glass toggle to settings screen
- add liquid glass toggle state and persistence
- port plugin-browser tests to Playwright
- port server-lifecycle tests to Playwright
- rewrite ci-monitoring skill in TypeScript (Bun)
- add Playwright browser E2E with Tauri API mocks
- add macos-latest to E2E matrix with tauri-wd
- detect macOS and use tauri-wd with correct capabilities
- add tauri-plugin-webdriver-automation for macOS E2E support
- add ci-monitoring skill with EN/JA docs and project symlink
- add data-testid to PluginBrowser and SettingsWindow
- add data-testid to AddServerChoiceModal and AddServerModal
- add data-testid to core shell components

### Bug Fixes
- improve color scheme for the “Create” button in the server creation modal
- resolve SwiftFormat vs SwiftLint conflict on TPS regex loop
- surface ServerListViewModel failures via a real alert
- gate stdout pipe salvage on never having been claimed live
- serve buffered stdout for processes that exit before the first read
- log an ActivityEntry when a server start succeeds
- raise waitUntil timeout in ServerListViewModelProcessTests to de-flake under parallel load
- drain stderr pipe to prevent server process hang under log spam
- resolve SwiftFormat/SwiftLint trailing comma conflict in CI
- address code review findings in Phase 3-A spikes
- handle persistence errors on liquid glass toggle
- make settings-window test robust against CI timing flakiness
- wait for Tauri IPC readiness on macOS CI before running tests
- add setBrowserName on macOS to satisfy selenium-webdriver requirement
- suppress unused std::fs import on non-macOS builds
- disable updater plugin in debug builds to prevent blocking dialog on Ubuntu CI
- specify 1920x1080 screen size for xvfb-run on Ubuntu E2E
- use xvfb-run+dbus-run-session and disable WebKit compositing for Ubuntu E2E
- wait for React mount before checking body text in app-launch
- add fluxbox window manager to Ubuntu E2E setup
- fix Xvfb resolution and add pre-build step for E2E
- add webkit2gtk-driver to Ubuntu apt packages
- replace macos-latest with ubuntu-latest for E2E matrix
- add shell: bash to Verify tauri-driver installation step
- replace fixed 2s wait with port polling and add null guards

### Maintenance
- remove unnecessary commands
- added ignore patterns
- optimize ci-monitoring skills
- bump sharp from 0.33.5 to 0.35.0 (#164)
- bump quinn-proto (#173)
- bump actions/setup-node
- bump postcss from 8.5.13 to 8.5.23
- bump serde\_with
- mark Phase 5 (Dashboard) complete
- mark Phase 3-B complete, record swiftui-pro review handover notes
- split ActivityRow into its own file
- disclose intentional stricter-than-Rust interior-dot rejection in resolveSafePath
- trim doc comments to satisfy file\_length lint after auto-format
- add ServerListViewModel + ServerProcessService integration tests
- sync phase matrix with Phase 2/3-A completion, ignore Instruments traces
- close Phase 3-A with literature-based glass verdict + 3-3 hitch data
- record Phase 3-A spike results and update risk table
- modified linguist detectable settings
- add ignore patterns
- add native macOS build instructions
- add native.yml build/test job on macos-26
- add native.yml lint job for apps/native-macos
- add lint-format-swift lefthook job
- add minimal CoreTests baseline
- add swift skills for native macOS implementation
- add native macOS phase task breakdown
- update root CLAUDE.md references and roadmap pointer
- revise native macOS plan for independent Swift implementation
- move spec documents from docs/ to spec/
- add next-phase plan for Rust Core and native macOS work
- add Rust Core + macOS Tahoe native app requirements
- bump the all-github-actions-dependencies group across 1 directory with 3 updates
- add automated screenshot capture pipeline for all views
- update Minecraft version list
- bump vite from 8.0.3 to 8.0.16
- bump the cargo group across 1 directory with 2 updates
- add ignore file patterns
- rewrite e2e.yml to use Playwright
- remove Mocha+Selenium e2e suite
- format shell files via shfmt
- approve pnpm build scripts for biome, parcel, lefthook, sharp
- update GitHub Actions to Node.js 24 compatible versions
- add .gitignore
- enhance skills
- add plugin-browser and settings E2E tests
- add server-lifecycle E2E tests
- add navigation E2E tests
- expand app-launch.test.ts with selector assertions
- extend selectors.ts and add test-utils.ts helper
- add unit tests for update-commands
- add unit tests for java-commands
- add unit tests for file-commands
- add unit tests for version-commands
- add unit tests for plugin-commands Spigot functions
- add unit tests for plugin-commands Hangar functions
- add unit tests for plugin-commands Modrinth functions
- add unit tests for plugin adapter layer
- add unit tests for ngrok-commands store operations
- add unit tests for console-history-commands
- add unit tests for config-commands
- add unit tests for server-commands CRUD
- add unit tests for ngrok-commands
- add unit tests for performance-commands
- add unit tests for health-check-commands
- add unit tests for backup-commands
- add unit tests for security-commands

### Other Changes
- Potential fix for pull request finding
- \[ImgBot\] Optimize images
- add agent skills

## v2.0.56

### Features
- update supported server verions
- add E2E app setup/teardown helper (macOS + Windows)
- add screenshot helper and selector definitions
- add Deploy Workflows
- integrate TypeDoc into docs build
- add Rust API reference page
- add TypeDoc generation script
- add typedoc.json config
- embed Video components in server-creation and backup-restore
- add Video MDX component
- add video assets from old wiki
- add developer section
- add troubleshooting section
- add network section
- add configuration section
- add features section
- add getting-started section
- add stub pages for all sidebar entries
- add docs homepage hero
- add favicon and logo assets
- add MC-Vector brand color CSS variables
- add astro.config.mjs with sidebar

### Bug Fixes
- fix Vite 8 rolldown worker build error for Monaco Editor
- simplify docs deploy — upload source to Vercel server-side build
- replace amondnet/vercel-action with vercel CLI directly
- remove invalid {#anchor} syntax from MDX headings
- switch to pnpm/action-setup for docs workflow
- use pnpm directly in docs build step
- track .md to .mdx renames missed by git after merge
- fix broken Users link in server-properties
- rename .md to .mdx for pages with MDX components
- add vite overrides to isolate docs from vite-plus-core (rolldown)
- fix astro.config.mjs social format and add content.config.ts

### Maintenance
- add unit tests for pure logic modules
- add macOS + Windows E2E workflow and test:e2e script
- change exclude settings
- add app-launch E2E test
- add tsconfig.json for e2e
- add e2e package.json with Selenium + Mocha + Chai
- add server-commands unit tests
- add tauriInvoke unit tests
- update justfile/Makefile test recipe to include Vitest
- add vitest.config.ts and src/test/setup.ts
- replace voidzero-dev/setup-vp with setup-node + pnpm action
- update npm scripts for vite8 + biome
- migrate vite.config.ts from vite-plus to vite, add biome.json
- remove vite-plus, add vite8 + biome + standard vitest
- add vitest and testing-library
- bump astro from 5.18.1 to 6.1.10 (#112)
- changed linguist detectable
- delete unnecessary files
- trigger docs CI
- gitignore docs vercel link config
- add docs build and deploy workflow
- gitignore TypeDoc and Rustdoc output
- apply formatter fixes to Phase 2 content
- update .gitignore for phase 2
- clean up phase 1 remaining files
- add docs/CLAUDE.md
- add docs lint command to lefthook.yml
- add biome.json
- init @mc-vector/docs package
- add docs workspace to pnpm-workspace.yaml
- format tsx files
- update development-guide.md
- update architecture.md to current state
- rewrite tutorial.md as wiki content draft
- remove current stable version line
- update README app versions

### Other Changes
- format

## v2.0.55

### Features
- unify app shell theme to zinc palette
- remove SLP health check card from dashboard
- remove online players section from users view
- center-align general settings form
- replace blue/cyan palette with zinc in proxy network views
- remove gradient background and cyan accents from backups view
- replace cyan folder colors with zinc in files view
- tone down active tab color and remove platform note banners
- replace old hardcoded grays in add-server-modal
- fix undefined tokens and slate colors in users-view
- remove cyan/gradient from server-settings, align to zinc palette
- fix sidebar active state and old hardcoded grays in app-layout
- remove cyan/gradient from console-view, align to zinc palette
- remove undefined view-bg/font-display tokens from dashboard
- remove cyan gradients from plugin-browser, compact update note
- replace cyan accents and gradients in advanced-settings-window
- align mc-modal colors to zinc palette
- flatten surface-card by removing box-shadow
- overhaul design tokens to zinc-950/900 palette with white accent
- remove gradient backgrounds and cyan accent from ui-components
- initialize window-state plugin for persistent window size/position
- migrate toast notifications from ToastProvider to sonner
- register global shortcuts for server start/stop/restart
- migrate clipboard operations to tauri plugin-clipboard-manager
- implement command palette with cmdk (Cmd+K)
- apply React Virtual to BackupsView backup list
- migrate DashboardView ping polling to React Query
- migrate PluginBrowser search and compatibility to React Query
- migrate AddServerModal to react-hook-form + zod
- Phase 6-5/6-6/6-7 - Tooltip, Select, Switch, Progress, SCSS cleanup (#105)
- Phase 6-3/6-4 - Migrate ContextMenu and Tabs to Radix UI (#104)

### Bug Fixes
- remove unused useQuery import and fix lint/fmt issues
- modal primary button text color white→black for accent background
- add missing plugin capabilities
- fix TDZ ReferenceError in App.tsx serverActionsRef
- add window-state capability and try-catch guard
- use sentinel value for empty javaPath in Radix Select
- remove redundant title h2 from UsersView
- address code review issues from Phase 7

### Maintenance
- migrate to lefthook and bump version to 2.0.55
- add new skills, symlink AGENTS.md, and format components
- mark DR Phase 3 as complete
- mark DR Phase 2 as complete
- update next-phase-plan with Phase 8 completion and Design Refactor progress
- update tailwind palette to zinc/neutral system
- update phase progress (Phase 7 complete)
- apply formatter to Phase 6 changed files
- update phase progress (Phase 6 complete)
- modify homebrew install commands in README
- format README.md
- Update README
- bump openssl

## v2.0.54

### Features
- update translations and fix component type errors
- merge add-server buttons into single choice modal
- add multi-server bulk operations and SLP ping health check (#21, #22)
- add desktop notifications for crash, start, and high CPU (#31)
- add server import from existing folder (#33)
- check for updates when switching to installed tab (#7)
- add file diff view to FilesView (#42)
- add version upgrade button to ServerSettings
- add VersionUpgradeWizard component and i18n keys
- add version-commands.ts with resolveLatestJarUrl
- add retention policy UI to ServerSettings and i18n keys
- add applyRetentionPolicy to BackupsView
- extend MinecraftServer type with backup retention policies
- phase 2 — property search, online players list
- extend syntax highlight language map
- phase 1 enhancements — history, uptime, JVM presets, syntax highlight
- improve console usability controls

### Bug Fixes
- resolve remaining TDZ error in PluginBrowser by moving helper block before installedEntries
- resolve TDZ error in PluginBrowser by moving installedEntries useMemo
- fix dashboard KPI grid layout so all 4 cards appear in one row
- VersionUpgradeWizard quality improvements
- remove Close button from backup step in VersionUpgradeWizard
- add error logging and type safety to resolveLatestJarUrl
- fix catalog sync, error context, and sort tiebreaker in applyRetentionPolicy
- stabilize CI yaml and windows just setup
- align app-shell translation typing

### Maintenance
- update version to 2.0.54
- update Cargo.lock for tauri-plugin-notification dependency
- gitignore .agents/, remove tracked skill files, fix server.rs comment
- format security.rs
- format rulefile
- add rulefiles
- edit CLAUDE.md
- add CLAUDE.md for Claude Code guidance
- fix mismatched package versions
- format & lint skill files
- update some dependencies
- delete scripts/install-extensions.sh
- bump rustls-webpki
- delete CONTRIBUTING.md
- fix format error
- strengthen catch error handling across app
- remove prettier and yaml lint tooling
- migrate yaml checks to prettier workflow
- migrate YAML checks to Prettier
- bump dependency versions
- changed README

## v2.0.53

### Bug Fixes
- enforce updater signature and windows artifact checks
- add base64 validation for WIN\_X64\_SIG and extend manifest validation for windows entry
- harden updater signature delivery flow
- refresh pnpm lockfile for ci
- apply CodeRabbit auto-fixes
- correct tauri fs scope permission id
- recover installed logo for classifier-style jar names
- resolve CI export break and installed metadata hydration
- resolve plugin follow-up UI regressions
- stabilize backup selector and plugin workflows

### Maintenance
- make task commands cross-platform
- bump app version to 2.0.52
- changed README (version details)

### Other Changes
- add missing files
- dependency audit
- format code

## v2.0.52

### Features
- optimize automation scheduler and dashboard rendering
- offload managed file reads and path normalization
- add rust command queue and log buffering
- optimize console rust parsing with append-only path
- add security command gateway dispatch flow
- extend security gateway with safe command/path and audit
- add rust ANSI parser path for console logs
- add security gateway RBAC and rate limiting
- add security/performance command prep

### Bug Fixes
- stabilize release dependency setup
- align release Node runtime with pnpm
- enforce dark native titlebar surfaces
- force dark-only app theme
- resolve CodeRabbit security findings
- resolve CodeRabbit performance findings
- address PR #81 review findings
- address PR #80 review findings
- clean command limiter state on server exit
- tighten tauri csp directives
- add audit logging for server control actions
- harden server command input boundaries
- harden ngrok tunnel URL extraction

### Maintenance
- refresh docs to latest main behavior
- add security ipc contract coverage
- add rust parser benchmark harness
- bump the all-github-actions-dependencies group with 6 updates
- bump vite-plus from 0.1.15 to 0.1.18

### Other Changes
- Revert "Security hardening: gateway RBAC and safeguards (#80)"
- Security hardening: gateway RBAC and safeguards (#80)
- format code

## v2.0.51

### Bug Fixes
- resolve recurring file save failures
- improve Java row and icon visibility
- polish ui visuals and action labels
- address PR73 review findings
- polish follow-up UI regressions
- resolve multi-view UI regressions
- address latest CodeRabbit follow-up findings
- address PR #72 review feedback
- deduplicate propsRef init and add role=menuitem to context menu
- resolve stale closure in use-server-runtime-listeners
- harden tauri security boundaries

### Maintenance
- remove obsolete planning artifacts
- add UI regression research and fix log
- format some files
- add @ path alias for app imports
- extract grouped servers hook
- extract view cycle shortcut hook
- extract app overlay layer
- extract sidebar header component
- extract main content frame
- extract app theme sync hook
- extract main header component
- extract sidebar navigation component
- extract app content router
- extract server create and proxy action hooks
- extract app updater hook
- use renderer registry for view content
- extract update and download display components
- extract server process actions hook
- extract server runtime listener hook
- extract server context actions hook
- extract server automation hook
- split App.tsx UI and helpers

### Other Changes
- Potential fix for pull request finding

## v2.0.5

### Maintenance
- update app version
- update Minecraft version list

## v2.0.49

### Features
- redesign console view hierarchy and controls
- redesign dashboard with kpi-first hierarchy
- refresh app shell visual hierarchy
- add semantic design tokens and surface primitives
- complete i18n key coverage
- add i18n infrastructure and fix plugin README HTML rendering
- change address of the development server using portless is https://mc-vector.localhost

### Bug Fixes
- prevent address button remount on ticker
- make console address control keyboard accessible
- apply color-scheme at shell scope
- finalize i18n sweep for dashboard and ui labels
- pre-commit
- format .gitignore
- fix duplicate run key in ci.yml
- add ignore pattern vp check
- add --fix option to ci.yml
- use pnpm exec portless in Makefile/justfile setup and update docs
- use pnpm dev instead of direct portless call in justfile dev/watch recipes

### Maintenance
- refactored the code to align with React best practices.
- finalize ui ux phase1 readiness fixes
- update ui ux phase matrix progress
- align dashboard kpi colors with tokens
- align design tokens with app theme control
- tighten task1 theme migration consistency
- migrate app theme modes to light dark system
- ignore local worktree directory
- add ui ux pro max design spec
- optimize console and plugin async flows
- apply react audit p0-p1 remediations
- add ignore pattern
- add linguist-detectable

### Other Changes
- Update README.md
- Update vite.config.ts
- Update justfile

## v2.0.48

### Features
- add GitHub Linguist configuration
- Add task runners and improve documentation
- add task runners and improve documentation

### Bug Fixes
- update linguist config per ChatGPT advice
- use linguist-language instead of linguist-detectable
- use explicit format for linguist attributes
- format docs/tutorial.md with vp check --fix
- format markdown files with vp check --fix
- use vp check directly in CI lint job
- call yamllint directly in task runners
- use vp exec for Tauri build in CI
- correct shell.nix platform deps, .envrc check, and untrack flake.lock
- remove docs/\*.md from .gitignore to track documentation

## v2.0.47

### Features
- add pre-commit at .vite-hooks
- migrate to Vite+ unified toolchain

### Bug Fixes
- address PR review comments
- use vp exec tauri for CI build
- use vp exec/pm for CI commands

### Maintenance
- revise tech stack and languages in README
- add .agents/ to .gitignore
- remove accidentally committed .agents folder
- remove accidentally committed PDF file
- .gitignore

## v2.0.46

### Maintenance
- update Minecraft version list

## v2.0.45

### Features
- add crashed state handling to server lifecycle
- throttle console log rendering with buffered flush
- add plugin update notifications in browser
- render plugin README with markdown
- plugin loader hints
- add plugin result sorting controls
- add plugin card detail preview
- improve plugin pagination navigation
- add auto-dependabot version updates daily

### Bug Fixes
- harden macOS release dmg rebuild step
- resolve plugin browser UX and backup selector issues
- restore modrinth pagination and hangar branding
- resolve plugin and settings regressions

### Performance
- optimize vite8 build and chunk strategy

### Maintenance
- introduce plugin adapters and shared guards
- correct next phase plan from code audit
- bump actions/setup-node from 4 to 6 (#26)
- bump peter-evans/create-pull-request from 5 to 8 (#25)
- bump pnpm/action-setup from 4 to 5 (#28)
- bump recharts from 3.6.0 to 3.8.1 (#32)
- bump @vitejs/plugin-react from 5.1.2 to 5.2.0 (#36)
- bump @biomejs/biome from 2.4.4 to 2.4.9 (#31)
- bump postcss from 8.5.6 to 8.5.8 (#35)
- bump typescript-eslint from 8.50.0 to 8.57.2 (#38)
- bump lint-staged from 16.2.7 to 16.4.0 (#39)
- bump react and @types/react (#29)
- bump actions/download-artifact from 4 to 8 (#24)
- configure dependabot for npm and GitHub Actions
- bump yaml from 2.8.2 to 2.8.3

### Other Changes
- Centralize SVG icon imports using barrel exports (#45)
- Consolidate Dependabot version updates into grouped PRs and add yamllint configuration (#40)

## v2.0.44

### Features
- Redesigned UI
- improve proxy and ngrok guide information flow
- unify tab visuals with plugin-inspired design
- implement server expansion workflows
- complete time-based backup scheduling
- extend backup and world management
- deepen plugin management workflow
- add dashboard monitoring charts
- console and file-drop improvements
- schedule auto backups
- auto-restart
- add console command history navigation
- add console log level filtering controls

### Maintenance
- introduce store foundation

## v2.0.43

### Features
- add console log search with keyboard shortcut

### Bug Fixes
- make windows updater metadata optional in release workflow
- stabilize updater pipeline and plugin source integrations

### Performance
- speed up bulk operations and setup flow

### Maintenance
- normalize import strategy for build stability
- clean remaining utility-heavy component styles
- style proxy setup and ngrok guide views
- extract additional views into scss partials
- modularize frontend styling structure
- replace scss

## v2.0.42

### Features
- release v2.0.42
- rename biome.jsonc to biome.json
- changed lint script
- modify package.json scripts
- modify lint-staged scripts
- modify the webhook message content
- changed install vscode-extensions message & update README.md

### Bug Fixes
- ci.yml script

### Maintenance
- update Minecraft version list
- bump flatted from 3.4.1 to 3.4.2
- bump rustls-webpki from 0.103.9 to 0.103.10 in /src-tauri
- bump tar from 0.4.44 to 0.4.45 in /src-tauri
- bump flatted from 3.3.3 to 3.4.1
- bump quinn-proto from 0.11.13 to 0.11.14 in /src-tauri
- add a webhook to discord
- Migrating from ESLint and Prettier to Biome

### Other Changes
- refactoring biome command from pnpx to pnpm dlx

## v2.0.41

### Bug Fixes
- Minecraft New Version Detection Workflow

### Maintenance
- add supported versions(older)
- update Minecraft version list

### Other Changes
- Delete update-output.json

## v2.0.4

### Features
- update app verion to 2.0.4

### Maintenance
- add supported versions 1.21.11
- centralize versionOptions and add automated Minecraft version update workflow (#12)
- add automated Minecraft version update workflow and centralize versionOptions

### Other Changes
- Initial plan

## v2.0.3

### Features
- update app version

### Maintenance
- Extract error message into helper function to avoid duplication

### Other Changes
- Address PR review feedback: make commands async, improve error detection, remove unused import
- Update src-tauri/src/commands/updater\_utils.rs
- Address code review feedback: improve comments and use unique temp file
- Format Rust code with cargo fmt
- Add read-only filesystem detection and improved error handling for macOS updates
- Initial plan

## v2.0.2

### Bug Fixes
- find executable
- Problem with apps crashing and not opening on macOS

## v2.0.1

### Features
- change README

### Bug Fixes
- prevent path traversal in collect\_files; bump glib to 0.20.0

### Other Changes
- Replace Electron with Tauri in technology stack

## v2.0.0

### Features
- Complete Migration from Electron to Tauri
- fixed an error in the automatic update feature

### Bug Fixes
- collect release files explicitly before upload
- use wildcard for all artifacts instead of specific patterns
- remove .nsis.zip from release files and add fail\_on\_unmatched\_files
- release.yml
- issue where DMG files couldn't be opened

### Maintenance
- let action-gh-release auto-create tags
- auto-release on push to main (version-gated)

## v1.1.7

### Bug Fixes
- changed eslint.config.js & an issue where apps become corrupted and cannot be opened on macOS

## v1.1.6

### Maintenance
- update tar to 7.5.7 + release version 1.1.6

### Other Changes
- Bump tar from 7.5.5 to 7.5.7

## v1.1.5

### Bug Fixes
- Security vulnerability related to Java paths

### Other Changes
- Potential fix for code scanning alert no. 6: Uncontrolled command line
- Bump tar from 6.2.1 to 7.5.6

## v1.1.4

### Bug Fixes
- Code formatting and fine-tuning

### Maintenance
- v1.1.4

### Other Changes
- Potential fix for code scanning alert no. 3: DOM text reinterpreted as HTML
- Potential fix for code scanning alert no. 1: Workflow does not contain permissions
- Bump tar from 7.5.2 to 7.5.3

## v1.1.3

### Features
- v1.1.3

### Bug Fixes
- hotfix failed updater checks reported in v1.1.1 and v1.1.2

## v1.1.2

### Bug Fixes
- Modify GitHub Actions settings

### Other Changes
- Fixed an issue where automatic updates were not occurring in Releases
- New versions are now automatically uploaded to Releases.

## v1.1.1

### Features
- Add application preferences
- add theme setting
- improve app updates and automatic updates

### Bug Fixes
- Add dependencies to pnpm-lock.yaml

### Other Changes
- Add auto-update flow and settings window

## v1.1.0

### Features
- improve security and user interface
- add configurable properties tab
- add console warning and error colors
- add keyboard shortcuts

### Bug Fixes
- build error
- Major logic changes

### Other Changes
- Use macos-14 runner for mac x64 build
- Update release workflow for pnpm
- Update README.md

## v1.0.1

### Other Changes
- Add Github workflow for Mac and Windows
- Update App Version
- Replace the entire project with code using TailwindCSS
- Add Discord Rich Presence
- Edit README.md
- Edit the .gitignore file
- Replace the app logo image

## v1.0.0

### Other Changes
- Add MIT License to the project
- Final adjustments before release
- Added a guide on how to set up the port forwarding elimination feature using Ngrok
- Fixed the issue where the sidebar was cut off
- Minor adjustments
- Added functionality eliminating the need for port forwarding, along with other partial UI/UX improvements
- UI/UX updates and functional specification changes
- Add Proxy Server Setup Procedure Documentation and User Management Tab
- Add the basic features required for the app
- first commit
## v2.0.64-beta.1

### Bug Fixes
- unblock cargo-audit CI failure on main (#230)

### Maintenance
- ignore local specification files
- bump the all-github-actions-dependencies group across 1 directory with 4 updates (#231)
- consolidate CI workflows and redundant test suites
- remove .claude

### Other Changes
- Add stable and beta update channels (#233)
- Automate changelog releases and display update notes (#228)

## v2.0.63

### Maintenance
- update Minecraft version list
- migrate package management from pnpm to Bun (#218)

## v2.0.62

### Features
- enforce verified artifacts and secure ngrok credentials
- make backup catalog authoritative
- add transactional full snapshot restore

### Bug Fixes
- harden real E2E diagnostics
- keep full snapshot creation authoritative
- constrain external import traversal
- enforce capability and managed import boundaries
- construct verified server jar checksums
- isolate E2E credential storage
- isolate OS credentials by app identifier
- harden catalog filesystem boundaries
- remove stale source reference from backup wrapper
- align full backup API and stabilize deletion tests
- refresh backup list after creation
- validate restore entries before filesystem access
- constrain restore verification to staging root
- keep legacy backup wrapper type-safe
- make backup archive paths analyzable

### Maintenance
- record provider canary limitation
- correct Rust verification count
- record expanded verification evidence
- expand real Tauri E2E coverage
- define verification and score gates
- define expanded real E2E responsibilities
- schedule native and provider E2E checks
- extend real Tauri coverage with deterministic fixtures
- refine ADR-006 platform setup
- isolate development bundle identifier
- pin GitHub Actions to commit SHAs
- add deterministic restore rollback failure injection
- add real Tauri backup restore smoke test
- define real Tauri E2E boundary
- define verified artifacts and secret storage
- format backup lifecycle assertions
- define catalog retention and recovery
- define full snapshot transactional restore
- add authoritative server operation boundary
- add ADR-001 operation boundary
- complete ADR hardening index
- establish ADR hardening index

## v2.0.61

### Bug Fixes
- stabilize selector indeterminate state
- confirm backup deletion before IPC
- keep manual backups running across view changes
- restore hierarchical backup target selection
- allow backup selector window close
- handle localized missing backup paths

### Maintenance
- remove unnecessary assets
- revise the prerequisites for development to ensure they are appropriate

## v2.0.6

### Features
- add EULA consent gate to first server start (#203)
- delete native app SPM

### Bug Fixes
- prevent duplicate backup view initialization
- treat missing backup catalog parents as empty
- apply retention to automatic backups
- align backup lifecycle with managed storage
- harden backup archive creation and restore
- notify Discord only for detected versions (#201)

### Maintenance
- align Rust formatting hooks
- cover backup catalog initialization boundaries
- update vitest and @vitest/ui to v5.0.0
- scope CI, E2E, Docs, and Release workflow triggers (#198)
- remove stale modal style hooks
- remove sass dependency and stale style classes
- migrate view styles to tailwind
- migrate app shell and modal styling
- normalize shared controls with tailwind variants
- make theme and base styles plain css
- move app styles from scss to css
- bump the all-npm-dependencies group across 1 directory with 55 updates (#197)
- delete Swift ci workflow

## v2.0.59

### Features
- add app-wide feedback policy and dialog
- add global hashless plugin download setting

### Bug Fixes
- make recursive file flows CodeQL-safe
- make picker and managed copy flows CodeQL-safe
- keep archive traversal on canonical paths
- make managed copy sinks explicit
- harden plugin download path boundaries
- keep managed backup paths typed
- make managed Java path tests portable
- guard managed filesystem sinks
- harden plugin download path data flow
- make managed path resolution CodeQL-safe
- make managed Java path test portable
- use supported cargo-audit invocation
- preserve structured plugin failure codes
- standardize plugin installation feedback
- use final plugin destinations for installs
- bound network and archive processing
- replace generic download and execution contracts
- enforce managed server and backup paths
- isolate Tauri filesystem capabilities
- clean up dark-theme UI inconsistencies in sidebar and settings

### Maintenance
- update Rust audit dependencies
- consolidate Playwright workflow commands
- stabilize Playwright CI execution
- verify shared feedback presentation
- cover plugin install feedback behavior
- cover application feature flows with Playwright
- move Playwright E2E into dedicated tests directory
- centralize Vitest tests under root tests
- cover plugin feedback behavior
- cover plugin downloads and managed placement
- harden CI supply chain checks
- add ignore pattern
- improve README overall
- bump sharp from 0.35.0 to 0.35.1 (#177)

## v2.0.58

### Bug Fixes
- stabilize Files editor and feedback UI (#179)
- harden server lifecycle and jar acquisition (#178)

### Maintenance
- add contribution and pull request guides (#180)

## v2.0.57

### Features
- Dashboard view with KPI cards and Swift Charts (task 5-4)
- TPSExtractor for Paper/LeafMC log parsing (task 5-3)
- ServerMetrics + ServerPerformanceService for 1Hz CPU/memory sampling (task 5-2)
- ServerProcessService PID, .online event, stdout broadcaster (task 5-1)
- Phase 4 — Navigation Shell + View Routing (native macOS) (#156)
- port security.rs authorization/rate-limit/path-safety/audit logic to Swift
- add Activity Drawer (task 3-10) for start/stop/crash history
- implement Floating Console Panel (task 3-9)
- implement live log-stream screen for native macOS server detail (task 3-8)
- add server process start/stop lifecycle (Task 3-7)
- add server detail pane (Inspector) to NavigationSplitView
- add server list sidebar screen and real app window (Task 3-5)
- add Server domain model and minimal servers.json store to Native app
- add high-frequency log stream spike + batching logic
- add NSPanel/WindowLevel glass spike scaffolding
- add hardened runtime Java launch spike harness
- add SwiftLint via SPM build tool plugin
- add SwiftFormat via SPM command plugin
- add placeholder RootView with #Preview
- scaffold apps/native-macos SwiftPM package
- add Liquid Glass toggle to settings screen
- add liquid glass toggle state and persistence
- port plugin-browser tests to Playwright
- port server-lifecycle tests to Playwright
- rewrite ci-monitoring skill in TypeScript (Bun)
- add Playwright browser E2E with Tauri API mocks
- add macos-latest to E2E matrix with tauri-wd
- detect macOS and use tauri-wd with correct capabilities
- add tauri-plugin-webdriver-automation for macOS E2E support
- add ci-monitoring skill with EN/JA docs and project symlink
- add data-testid to PluginBrowser and SettingsWindow
- add data-testid to AddServerChoiceModal and AddServerModal
- add data-testid to core shell components

### Bug Fixes
- improve color scheme for the “Create” button in the server creation modal
- resolve SwiftFormat vs SwiftLint conflict on TPS regex loop
- surface ServerListViewModel failures via a real alert
- gate stdout pipe salvage on never having been claimed live
- serve buffered stdout for processes that exit before the first read
- log an ActivityEntry when a server start succeeds
- raise waitUntil timeout in ServerListViewModelProcessTests to de-flake under parallel load
- drain stderr pipe to prevent server process hang under log spam
- resolve SwiftFormat/SwiftLint trailing comma conflict in CI
- address code review findings in Phase 3-A spikes
- handle persistence errors on liquid glass toggle
- make settings-window test robust against CI timing flakiness
- wait for Tauri IPC readiness on macOS CI before running tests
- add setBrowserName on macOS to satisfy selenium-webdriver requirement
- suppress unused std::fs import on non-macOS builds
- disable updater plugin in debug builds to prevent blocking dialog on Ubuntu CI
- specify 1920x1080 screen size for xvfb-run on Ubuntu E2E
- use xvfb-run+dbus-run-session and disable WebKit compositing for Ubuntu E2E
- wait for React mount before checking body text in app-launch
- add fluxbox window manager to Ubuntu E2E setup
- fix Xvfb resolution and add pre-build step for E2E
- add webkit2gtk-driver to Ubuntu apt packages
- replace macos-latest with ubuntu-latest for E2E matrix
- add shell: bash to Verify tauri-driver installation step
- replace fixed 2s wait with port polling and add null guards

### Maintenance
- remove unnecessary commands
- added ignore patterns
- optimize ci-monitoring skills
- bump sharp from 0.33.5 to 0.35.0 (#164)
- bump quinn-proto (#173)
- bump actions/setup-node
- bump postcss from 8.5.13 to 8.5.23
- bump serde\_with
- mark Phase 5 (Dashboard) complete
- mark Phase 3-B complete, record swiftui-pro review handover notes
- split ActivityRow into its own file
- disclose intentional stricter-than-Rust interior-dot rejection in resolveSafePath
- trim doc comments to satisfy file\_length lint after auto-format
- add ServerListViewModel + ServerProcessService integration tests
- sync phase matrix with Phase 2/3-A completion, ignore Instruments traces
- close Phase 3-A with literature-based glass verdict + 3-3 hitch data
- record Phase 3-A spike results and update risk table
- modified linguist detectable settings
- add ignore patterns
- add native macOS build instructions
- add native.yml build/test job on macos-26
- add native.yml lint job for apps/native-macos
- add lint-format-swift lefthook job
- add minimal CoreTests baseline
- add swift skills for native macOS implementation
- add native macOS phase task breakdown
- update root CLAUDE.md references and roadmap pointer
- revise native macOS plan for independent Swift implementation
- move spec documents from docs/ to spec/
- add next-phase plan for Rust Core and native macOS work
- add Rust Core + macOS Tahoe native app requirements
- bump the all-github-actions-dependencies group across 1 directory with 3 updates
- add automated screenshot capture pipeline for all views
- update Minecraft version list
- bump vite from 8.0.3 to 8.0.16
- bump the cargo group across 1 directory with 2 updates
- add ignore file patterns
- rewrite e2e.yml to use Playwright
- remove Mocha+Selenium e2e suite
- format shell files via shfmt
- approve pnpm build scripts for biome, parcel, lefthook, sharp
- update GitHub Actions to Node.js 24 compatible versions
- add .gitignore
- enhance skills
- add plugin-browser and settings E2E tests
- add server-lifecycle E2E tests
- add navigation E2E tests
- expand app-launch.test.ts with selector assertions
- extend selectors.ts and add test-utils.ts helper
- add unit tests for update-commands
- add unit tests for java-commands
- add unit tests for file-commands
- add unit tests for version-commands
- add unit tests for plugin-commands Spigot functions
- add unit tests for plugin-commands Hangar functions
- add unit tests for plugin-commands Modrinth functions
- add unit tests for plugin adapter layer
- add unit tests for ngrok-commands store operations
- add unit tests for console-history-commands
- add unit tests for config-commands
- add unit tests for server-commands CRUD
- add unit tests for ngrok-commands
- add unit tests for performance-commands
- add unit tests for health-check-commands
- add unit tests for backup-commands
- add unit tests for security-commands

### Other Changes
- Potential fix for pull request finding
- \[ImgBot\] Optimize images
- add agent skills

## v2.0.56

### Features
- update supported server verions
- add E2E app setup/teardown helper (macOS + Windows)
- add screenshot helper and selector definitions
- add Deploy Workflows
- integrate TypeDoc into docs build
- add Rust API reference page
- add TypeDoc generation script
- add typedoc.json config
- embed Video components in server-creation and backup-restore
- add Video MDX component
- add video assets from old wiki
- add developer section
- add troubleshooting section
- add network section
- add configuration section
- add features section
- add getting-started section
- add stub pages for all sidebar entries
- add docs homepage hero
- add favicon and logo assets
- add MC-Vector brand color CSS variables
- add astro.config.mjs with sidebar

### Bug Fixes
- fix Vite 8 rolldown worker build error for Monaco Editor
- simplify docs deploy — upload source to Vercel server-side build
- replace amondnet/vercel-action with vercel CLI directly
- remove invalid {#anchor} syntax from MDX headings
- switch to pnpm/action-setup for docs workflow
- use pnpm directly in docs build step
- track .md to .mdx renames missed by git after merge
- fix broken Users link in server-properties
- rename .md to .mdx for pages with MDX components
- add vite overrides to isolate docs from vite-plus-core (rolldown)
- fix astro.config.mjs social format and add content.config.ts

### Maintenance
- add unit tests for pure logic modules
- add macOS + Windows E2E workflow and test:e2e script
- change exclude settings
- add app-launch E2E test
- add tsconfig.json for e2e
- add e2e package.json with Selenium + Mocha + Chai
- add server-commands unit tests
- add tauriInvoke unit tests
- update justfile/Makefile test recipe to include Vitest
- add vitest.config.ts and src/test/setup.ts
- replace voidzero-dev/setup-vp with setup-node + pnpm action
- update npm scripts for vite8 + biome
- migrate vite.config.ts from vite-plus to vite, add biome.json
- remove vite-plus, add vite8 + biome + standard vitest
- add vitest and testing-library
- bump astro from 5.18.1 to 6.1.10 (#112)
- changed linguist detectable
- delete unnecessary files
- trigger docs CI
- gitignore docs vercel link config
- add docs build and deploy workflow
- gitignore TypeDoc and Rustdoc output
- apply formatter fixes to Phase 2 content
- update .gitignore for phase 2
- clean up phase 1 remaining files
- add docs/CLAUDE.md
- add docs lint command to lefthook.yml
- add biome.json
- init @mc-vector/docs package
- add docs workspace to pnpm-workspace.yaml
- format tsx files
- update development-guide.md
- update architecture.md to current state
- rewrite tutorial.md as wiki content draft
- remove current stable version line
- update README app versions

### Other Changes
- format

## v2.0.55

### Features
- unify app shell theme to zinc palette
- remove SLP health check card from dashboard
- remove online players section from users view
- center-align general settings form
- replace blue/cyan palette with zinc in proxy network views
- remove gradient background and cyan accents from backups view
- replace cyan folder colors with zinc in files view
- tone down active tab color and remove platform note banners
- replace old hardcoded grays in add-server-modal
- fix undefined tokens and slate colors in users-view
- remove cyan/gradient from server-settings, align to zinc palette
- fix sidebar active state and old hardcoded grays in app-layout
- remove cyan/gradient from console-view, align to zinc palette
- remove undefined view-bg/font-display tokens from dashboard
- remove cyan gradients from plugin-browser, compact update note
- replace cyan accents and gradients in advanced-settings-window
- align mc-modal colors to zinc palette
- flatten surface-card by removing box-shadow
- overhaul design tokens to zinc-950/900 palette with white accent
- remove gradient backgrounds and cyan accent from ui-components
- initialize window-state plugin for persistent window size/position
- migrate toast notifications from ToastProvider to sonner
- register global shortcuts for server start/stop/restart
- migrate clipboard operations to tauri plugin-clipboard-manager
- implement command palette with cmdk (Cmd+K)
- apply React Virtual to BackupsView backup list
- migrate DashboardView ping polling to React Query
- migrate PluginBrowser search and compatibility to React Query
- migrate AddServerModal to react-hook-form + zod
- Phase 6-5/6-6/6-7 - Tooltip, Select, Switch, Progress, SCSS cleanup (#105)
- Phase 6-3/6-4 - Migrate ContextMenu and Tabs to Radix UI (#104)

### Bug Fixes
- remove unused useQuery import and fix lint/fmt issues
- modal primary button text color white→black for accent background
- add missing plugin capabilities
- fix TDZ ReferenceError in App.tsx serverActionsRef
- add window-state capability and try-catch guard
- use sentinel value for empty javaPath in Radix Select
- remove redundant title h2 from UsersView
- address code review issues from Phase 7

### Maintenance
- migrate to lefthook and bump version to 2.0.55
- add new skills, symlink AGENTS.md, and format components
- mark DR Phase 3 as complete
- mark DR Phase 2 as complete
- update next-phase-plan with Phase 8 completion and Design Refactor progress
- update tailwind palette to zinc/neutral system
- update phase progress (Phase 7 complete)
- apply formatter to Phase 6 changed files
- update phase progress (Phase 6 complete)
- modify homebrew install commands in README
- format README.md
- Update README
- bump openssl

## v2.0.54

### Features
- update translations and fix component type errors
- merge add-server buttons into single choice modal
- add multi-server bulk operations and SLP ping health check (#21, #22)
- add desktop notifications for crash, start, and high CPU (#31)
- add server import from existing folder (#33)
- check for updates when switching to installed tab (#7)
- add file diff view to FilesView (#42)
- add version upgrade button to ServerSettings
- add VersionUpgradeWizard component and i18n keys
- add version-commands.ts with resolveLatestJarUrl
- add retention policy UI to ServerSettings and i18n keys
- add applyRetentionPolicy to BackupsView
- extend MinecraftServer type with backup retention policies
- phase 2 — property search, online players list
- extend syntax highlight language map
- phase 1 enhancements — history, uptime, JVM presets, syntax highlight
- improve console usability controls

### Bug Fixes
- resolve remaining TDZ error in PluginBrowser by moving helper block before installedEntries
- resolve TDZ error in PluginBrowser by moving installedEntries useMemo
- fix dashboard KPI grid layout so all 4 cards appear in one row
- VersionUpgradeWizard quality improvements
- remove Close button from backup step in VersionUpgradeWizard
- add error logging and type safety to resolveLatestJarUrl
- fix catalog sync, error context, and sort tiebreaker in applyRetentionPolicy
- stabilize CI yaml and windows just setup
- align app-shell translation typing

### Maintenance
- update version to 2.0.54
- update Cargo.lock for tauri-plugin-notification dependency
- gitignore .agents/, remove tracked skill files, fix server.rs comment
- format security.rs
- format rulefile
- add rulefiles
- edit CLAUDE.md
- add CLAUDE.md for Claude Code guidance
- fix mismatched package versions
- format & lint skill files
- update some dependencies
- delete scripts/install-extensions.sh
- bump rustls-webpki
- delete CONTRIBUTING.md
- fix format error
- strengthen catch error handling across app
- remove prettier and yaml lint tooling
- migrate yaml checks to prettier workflow
- migrate YAML checks to Prettier
- bump dependency versions
- changed README

## v2.0.53

### Bug Fixes
- enforce updater signature and windows artifact checks
- add base64 validation for WIN\_X64\_SIG and extend manifest validation for windows entry
- harden updater signature delivery flow
- refresh pnpm lockfile for ci
- apply CodeRabbit auto-fixes
- correct tauri fs scope permission id
- recover installed logo for classifier-style jar names
- resolve CI export break and installed metadata hydration
- resolve plugin follow-up UI regressions
- stabilize backup selector and plugin workflows

### Maintenance
- make task commands cross-platform
- bump app version to 2.0.52
- changed README (version details)

### Other Changes
- add missing files
- dependency audit
- format code

## v2.0.52

### Features
- optimize automation scheduler and dashboard rendering
- offload managed file reads and path normalization
- add rust command queue and log buffering
- optimize console rust parsing with append-only path
- add security command gateway dispatch flow
- extend security gateway with safe command/path and audit
- add rust ANSI parser path for console logs
- add security gateway RBAC and rate limiting
- add security/performance command prep

### Bug Fixes
- stabilize release dependency setup
- align release Node runtime with pnpm
- enforce dark native titlebar surfaces
- force dark-only app theme
- resolve CodeRabbit security findings
- resolve CodeRabbit performance findings
- address PR #81 review findings
- address PR #80 review findings
- clean command limiter state on server exit
- tighten tauri csp directives
- add audit logging for server control actions
- harden server command input boundaries
- harden ngrok tunnel URL extraction

### Maintenance
- refresh docs to latest main behavior
- add security ipc contract coverage
- add rust parser benchmark harness
- bump the all-github-actions-dependencies group with 6 updates
- bump vite-plus from 0.1.15 to 0.1.18

### Other Changes
- Revert "Security hardening: gateway RBAC and safeguards (#80)"
- Security hardening: gateway RBAC and safeguards (#80)
- format code

## v2.0.51

### Bug Fixes
- resolve recurring file save failures
- improve Java row and icon visibility
- polish ui visuals and action labels
- address PR73 review findings
- polish follow-up UI regressions
- resolve multi-view UI regressions
- address latest CodeRabbit follow-up findings
- address PR #72 review feedback
- deduplicate propsRef init and add role=menuitem to context menu
- resolve stale closure in use-server-runtime-listeners
- harden tauri security boundaries

### Maintenance
- remove obsolete planning artifacts
- add UI regression research and fix log
- format some files
- add @ path alias for app imports
- extract grouped servers hook
- extract view cycle shortcut hook
- extract app overlay layer
- extract sidebar header component
- extract main content frame
- extract app theme sync hook
- extract main header component
- extract sidebar navigation component
- extract app content router
- extract server create and proxy action hooks
- extract app updater hook
- use renderer registry for view content
- extract update and download display components
- extract server process actions hook
- extract server runtime listener hook
- extract server context actions hook
- extract server automation hook
- split App.tsx UI and helpers

### Other Changes
- Potential fix for pull request finding

## v2.0.5

### Maintenance
- update app version
- update Minecraft version list

## v2.0.49

### Features
- redesign console view hierarchy and controls
- redesign dashboard with kpi-first hierarchy
- refresh app shell visual hierarchy
- add semantic design tokens and surface primitives
- complete i18n key coverage
- add i18n infrastructure and fix plugin README HTML rendering
- change address of the development server using portless is https://mc-vector.localhost

### Bug Fixes
- prevent address button remount on ticker
- make console address control keyboard accessible
- apply color-scheme at shell scope
- finalize i18n sweep for dashboard and ui labels
- pre-commit
- format .gitignore
- fix duplicate run key in ci.yml
- add ignore pattern vp check
- add --fix option to ci.yml
- use pnpm exec portless in Makefile/justfile setup and update docs
- use pnpm dev instead of direct portless call in justfile dev/watch recipes

### Maintenance
- refactored the code to align with React best practices.
- finalize ui ux phase1 readiness fixes
- update ui ux phase matrix progress
- align dashboard kpi colors with tokens
- align design tokens with app theme control
- tighten task1 theme migration consistency
- migrate app theme modes to light dark system
- ignore local worktree directory
- add ui ux pro max design spec
- optimize console and plugin async flows
- apply react audit p0-p1 remediations
- add ignore pattern
- add linguist-detectable

### Other Changes
- Update README.md
- Update vite.config.ts
- Update justfile

## v2.0.48

### Features
- add GitHub Linguist configuration
- Add task runners and improve documentation
- add task runners and improve documentation

### Bug Fixes
- update linguist config per ChatGPT advice
- use linguist-language instead of linguist-detectable
- use explicit format for linguist attributes
- format docs/tutorial.md with vp check --fix
- format markdown files with vp check --fix
- use vp check directly in CI lint job
- call yamllint directly in task runners
- use vp exec for Tauri build in CI
- correct shell.nix platform deps, .envrc check, and untrack flake.lock
- remove docs/\*.md from .gitignore to track documentation

## v2.0.47

### Features
- add pre-commit at .vite-hooks
- migrate to Vite+ unified toolchain

### Bug Fixes
- address PR review comments
- use vp exec tauri for CI build
- use vp exec/pm for CI commands

### Maintenance
- revise tech stack and languages in README
- add .agents/ to .gitignore
- remove accidentally committed .agents folder
- remove accidentally committed PDF file
- .gitignore

## v2.0.46

### Maintenance
- update Minecraft version list

## v2.0.45

### Features
- add crashed state handling to server lifecycle
- throttle console log rendering with buffered flush
- add plugin update notifications in browser
- render plugin README with markdown
- plugin loader hints
- add plugin result sorting controls
- add plugin card detail preview
- improve plugin pagination navigation
- add auto-dependabot version updates daily

### Bug Fixes
- harden macOS release dmg rebuild step
- resolve plugin browser UX and backup selector issues
- restore modrinth pagination and hangar branding
- resolve plugin and settings regressions

### Performance
- optimize vite8 build and chunk strategy

### Maintenance
- introduce plugin adapters and shared guards
- correct next phase plan from code audit
- bump actions/setup-node from 4 to 6 (#26)
- bump peter-evans/create-pull-request from 5 to 8 (#25)
- bump pnpm/action-setup from 4 to 5 (#28)
- bump recharts from 3.6.0 to 3.8.1 (#32)
- bump @vitejs/plugin-react from 5.1.2 to 5.2.0 (#36)
- bump @biomejs/biome from 2.4.4 to 2.4.9 (#31)
- bump postcss from 8.5.6 to 8.5.8 (#35)
- bump typescript-eslint from 8.50.0 to 8.57.2 (#38)
- bump lint-staged from 16.2.7 to 16.4.0 (#39)
- bump react and @types/react (#29)
- bump actions/download-artifact from 4 to 8 (#24)
- configure dependabot for npm and GitHub Actions
- bump yaml from 2.8.2 to 2.8.3

### Other Changes
- Centralize SVG icon imports using barrel exports (#45)
- Consolidate Dependabot version updates into grouped PRs and add yamllint configuration (#40)

## v2.0.44

### Features
- Redesigned UI
- improve proxy and ngrok guide information flow
- unify tab visuals with plugin-inspired design
- implement server expansion workflows
- complete time-based backup scheduling
- extend backup and world management
- deepen plugin management workflow
- add dashboard monitoring charts
- console and file-drop improvements
- schedule auto backups
- auto-restart
- add console command history navigation
- add console log level filtering controls

### Maintenance
- introduce store foundation

## v2.0.43

### Features
- add console log search with keyboard shortcut

### Bug Fixes
- make windows updater metadata optional in release workflow
- stabilize updater pipeline and plugin source integrations

### Performance
- speed up bulk operations and setup flow

### Maintenance
- normalize import strategy for build stability
- clean remaining utility-heavy component styles
- style proxy setup and ngrok guide views
- extract additional views into scss partials
- modularize frontend styling structure
- replace scss

## v2.0.42

### Features
- release v2.0.42
- rename biome.jsonc to biome.json
- changed lint script
- modify package.json scripts
- modify lint-staged scripts
- modify the webhook message content
- changed install vscode-extensions message & update README.md

### Bug Fixes
- ci.yml script

### Maintenance
- update Minecraft version list
- bump flatted from 3.4.1 to 3.4.2
- bump rustls-webpki from 0.103.9 to 0.103.10 in /src-tauri
- bump tar from 0.4.44 to 0.4.45 in /src-tauri
- bump flatted from 3.3.3 to 3.4.1
- bump quinn-proto from 0.11.13 to 0.11.14 in /src-tauri
- add a webhook to discord
- Migrating from ESLint and Prettier to Biome

### Other Changes
- refactoring biome command from pnpx to pnpm dlx

## v2.0.41

### Bug Fixes
- Minecraft New Version Detection Workflow

### Maintenance
- add supported versions(older)
- update Minecraft version list

### Other Changes
- Delete update-output.json

## v2.0.4

### Features
- update app verion to 2.0.4

### Maintenance
- add supported versions 1.21.11
- centralize versionOptions and add automated Minecraft version update workflow (#12)
- add automated Minecraft version update workflow and centralize versionOptions

### Other Changes
- Initial plan

## v2.0.3

### Features
- update app version

### Maintenance
- Extract error message into helper function to avoid duplication

### Other Changes
- Address PR review feedback: make commands async, improve error detection, remove unused import
- Update src-tauri/src/commands/updater\_utils.rs
- Address code review feedback: improve comments and use unique temp file
- Format Rust code with cargo fmt
- Add read-only filesystem detection and improved error handling for macOS updates
- Initial plan

## v2.0.2

### Bug Fixes
- find executable
- Problem with apps crashing and not opening on macOS

## v2.0.1

### Features
- change README

### Bug Fixes
- prevent path traversal in collect\_files; bump glib to 0.20.0

### Other Changes
- Replace Electron with Tauri in technology stack

## v2.0.0

### Features
- Complete Migration from Electron to Tauri
- fixed an error in the automatic update feature

### Bug Fixes
- collect release files explicitly before upload
- use wildcard for all artifacts instead of specific patterns
- remove .nsis.zip from release files and add fail\_on\_unmatched\_files
- release.yml
- issue where DMG files couldn't be opened

### Maintenance
- let action-gh-release auto-create tags
- auto-release on push to main (version-gated)

## v1.1.7

### Bug Fixes
- changed eslint.config.js & an issue where apps become corrupted and cannot be opened on macOS

## v1.1.6

### Maintenance
- update tar to 7.5.7 + release version 1.1.6

### Other Changes
- Bump tar from 7.5.5 to 7.5.7

## v1.1.5

### Bug Fixes
- Security vulnerability related to Java paths

### Other Changes
- Potential fix for code scanning alert no. 6: Uncontrolled command line
- Bump tar from 6.2.1 to 7.5.6

## v1.1.4

### Bug Fixes
- Code formatting and fine-tuning

### Maintenance
- v1.1.4

### Other Changes
- Potential fix for code scanning alert no. 3: DOM text reinterpreted as HTML
- Potential fix for code scanning alert no. 1: Workflow does not contain permissions
- Bump tar from 7.5.2 to 7.5.3

## v1.1.3

### Features
- v1.1.3

### Bug Fixes
- hotfix failed updater checks reported in v1.1.1 and v1.1.2

## v1.1.2

### Bug Fixes
- Modify GitHub Actions settings

### Other Changes
- Fixed an issue where automatic updates were not occurring in Releases
- New versions are now automatically uploaded to Releases.

## v1.1.1

### Features
- Add application preferences
- add theme setting
- improve app updates and automatic updates

### Bug Fixes
- Add dependencies to pnpm-lock.yaml

### Other Changes
- Add auto-update flow and settings window

## v1.1.0

### Features
- improve security and user interface
- add configurable properties tab
- add console warning and error colors
- add keyboard shortcuts

### Bug Fixes
- build error
- Major logic changes

### Other Changes
- Use macos-14 runner for mac x64 build
- Update release workflow for pnpm
- Update README.md

## v1.0.1

### Other Changes
- Add Github workflow for Mac and Windows
- Update App Version
- Replace the entire project with code using TailwindCSS
- Add Discord Rich Presence
- Edit README.md
- Edit the .gitignore file
- Replace the app logo image

## v1.0.0

### Other Changes
- Add MIT License to the project
- Final adjustments before release
- Added a guide on how to set up the port forwarding elimination feature using Ngrok
- Fixed the issue where the sidebar was cut off
- Minor adjustments
- Added functionality eliminating the need for port forwarding, along with other partial UI/UX improvements
- UI/UX updates and functional specification changes
- Add Proxy Server Setup Procedure Documentation and User Management Tab
- Add the basic features required for the app
- first commit
