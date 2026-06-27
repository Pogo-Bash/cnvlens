<template>
  <section class="space-y-4">
    <h2 class="text-xl font-bold text-text">install</h2>

    <div class="flex flex-col md:flex-row gap-6">
      <!-- ── LEFT: tree nav (desktop) ─────────────────────────────────── -->
      <nav class="hidden md:block w-56 flex-shrink-0">
        <div class="sticky top-24 space-y-0.5">
          <p class="text-xs font-bold text-subtext1 uppercase tracking-wider mb-2">Install</p>
          <template v-for="node in tree" :key="node.id">
            <div>
              <button
                @click="onNodeClick(node)"
                class="w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm text-left transition-colors"
                :class="activeId === node.id ? 'text-blue font-semibold bg-surface0/60' : 'text-subtext0 hover:text-text'"
              >
                <span v-if="node.children" class="text-overlay0 text-[10px] w-3 transition-transform"
                  :class="isExpanded(node.id) ? 'rotate-90' : ''">▶</span>
                <span v-else class="w-3"></span>
                {{ node.label }}
              </button>
              <div v-if="node.children && isExpanded(node.id)" class="ml-4 border-l border-surface1 pl-2 space-y-0.5">
                <button
                  v-for="child in node.children" :key="child.id"
                  @click="scrollTo(child.id)"
                  class="w-full px-2 py-0.5 rounded text-xs text-left transition-colors"
                  :class="activeId === child.id ? 'text-blue font-semibold' : 'text-subtext0 hover:text-text'"
                >{{ child.label }}</button>
              </div>
            </div>
          </template>
        </div>
      </nav>

      <!-- ── LEFT: horizontal tabs (mobile) ───────────────────────────── -->
      <div class="md:hidden -mx-1">
        <div class="flex gap-1.5 overflow-x-auto pb-1 px-1">
          <button
            v-for="node in tree" :key="node.id"
            @click="onNodeClick(node)"
            class="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap"
            :class="topActive === node.id ? 'bg-blue text-crust' : 'bg-surface0 text-subtext0'"
          >{{ node.label }}</button>
        </div>
        <div v-if="activeParent && activeParent.children" class="flex gap-1.5 overflow-x-auto pb-1 px-1 mt-1">
          <button
            v-for="child in activeParent.children" :key="child.id"
            @click="scrollTo(child.id)"
            class="flex-shrink-0 px-2.5 py-0.5 rounded-full text-[11px] transition-colors whitespace-nowrap"
            :class="activeId === child.id ? 'bg-surface2 text-text' : 'bg-surface0/60 text-subtext0'"
          >{{ child.label }}</button>
        </div>
      </div>

      <!-- ── RIGHT: content ───────────────────────────────────────────── -->
      <div class="flex-1 min-w-0 space-y-10">
        <!-- QUICK -->
        <div :id="ids.quick" ref="sectionRefs" :data-id="ids.quick" class="scroll-mt-24 space-y-3">
          <h3 class="text-lg font-bold text-text">Quick Install</h3>
          <div>
            <span
              class="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
              :class="detected ? 'bg-green/20 text-green' : 'bg-yellow/20 text-yellow'"
            >{{ detected ? `Detected: ${detected.label}` : 'Could not detect OS' }}</span>
          </div>

          <CodeBlock :lang="recommend.lang" :code="recommend.cmd" />

          <div v-if="recommend.tealCallout" class="rounded-lg border border-teal/60 bg-surface0/40 p-3">
            <p class="text-sm font-bold text-teal mb-1">Interactive installer</p>
            <p class="text-sm text-subtext0">
              This script launches a guided TUI installer in your terminal. It detects your
              environment, shows a progress display, and verifies the install.
            </p>
          </div>

          <Collapsible v-if="recommend.tealCallout" title="What does install.sh do?">
            <ol class="list-decimal list-inside text-sm text-subtext0 space-y-1">
              <li>Welcome screen with CodonSplice ASCII art</li>
              <li>Environment detection — OS, arch, curl, tar, install directory, PATH</li>
              <li>Install method — prebuilt binary (recommended) or cargo from source</li>
              <li>Download &amp; install — fetches the correct binary from GitHub Releases to
                <code>~/.local/bin</code>, configures PATH automatically</li>
              <li>Verification — confirms <code>splice</code> works</li>
              <li>Post-install — open the TUI or documentation</li>
            </ol>
            <p class="text-sm text-subtext0 mt-2">
              No sudo required. Installs to <code>~/.local/bin</code> and adds to PATH in
              <code>~/.bashrc</code>, <code>~/.zshrc</code>, or <code>~/.profile</code>.
            </p>
          </Collapsible>

          <p class="text-sm text-subtext0">Not right? Jump to your platform:
            <a v-for="(l, i) in platformLinks" :key="l.id" href="#" @click.prevent="scrollTo(l.id)"
              class="text-blue hover:underline">{{ l.label }}<span v-if="i < platformLinks.length - 1" class="text-overlay0">, </span></a>
          </p>
        </div>

        <!-- macOS -->
        <div :id="ids.macos" :data-id="ids.macos" class="scroll-mt-24 space-y-4">
          <h3 class="text-lg font-bold text-text">macOS</h3>
          <div :id="ids.macosArm" :data-id="ids.macosArm" class="scroll-mt-24 space-y-2">
            <h4 class="text-sm font-bold text-mauve">Apple Silicon (M1/M2/M3)</h4>
            <CodeBlock lang="bash" :code="mac.arm" />
          </div>
          <div :id="ids.macosX86" :data-id="ids.macosX86" class="scroll-mt-24 space-y-2">
            <h4 class="text-sm font-bold text-mauve">Intel</h4>
            <CodeBlock lang="bash" :code="mac.x86" />
          </div>
        </div>

        <!-- Linux -->
        <div :id="ids.linux" :data-id="ids.linux" class="scroll-mt-24 space-y-4">
          <h3 class="text-lg font-bold text-text">Linux</h3>
          <div :id="ids.linuxX86" :data-id="ids.linuxX86" class="scroll-mt-24 space-y-2">
            <h4 class="text-sm font-bold text-mauve">x86_64</h4>
            <CodeBlock lang="sh" :code="linuxInstaller" />
            <div class="rounded-lg border border-teal/60 bg-surface0/40 p-3">
              <p class="text-sm font-bold text-teal mb-1">Interactive installer</p>
              <p class="text-sm text-subtext0">Launches the guided TUI installer — detects your
                environment, streams progress, and verifies the install.</p>
            </div>
            <Collapsible title="What does install.sh do?">
              <ol class="list-decimal list-inside text-sm text-subtext0 space-y-1">
                <li>Welcome screen with CodonSplice ASCII art</li>
                <li>Environment detection — OS, arch, curl, tar, install directory, PATH</li>
                <li>Install method — prebuilt binary (recommended) or cargo from source</li>
                <li>Download &amp; install — fetches the correct binary from GitHub Releases to
                  <code>~/.local/bin</code>, configures PATH automatically</li>
                <li>Verification — confirms <code>splice</code> works</li>
                <li>Post-install — open the TUI or documentation</li>
              </ol>
              <p class="text-sm text-subtext0 mt-2">No sudo required. Installs to
                <code>~/.local/bin</code> and adds to PATH in <code>~/.bashrc</code>,
                <code>~/.zshrc</code>, or <code>~/.profile</code> depending on your shell.</p>
            </Collapsible>
            <CodeBlock lang="bash" :code="linux.x86Manual" />
          </div>
          <div :id="ids.linuxArm" :data-id="ids.linuxArm" class="scroll-mt-24 space-y-2">
            <h4 class="text-sm font-bold text-mauve">aarch64 (ARM)</h4>
            <CodeBlock lang="sh" :code="linuxInstaller" />
            <CodeBlock lang="bash" :code="linux.armManual" />
            <p class="text-xs text-subtext0">Tested on Ubuntu 22.04+, Debian 12+, AWS Graviton, and Raspberry Pi 4/5.</p>
          </div>
          <div :id="ids.linuxCargo" :data-id="ids.linuxCargo" class="scroll-mt-24 space-y-2">
            <h4 class="text-sm font-bold text-mauve">Via cargo</h4>
            <CodeBlock lang="bash" :code="linux.cargo" />
            <p class="text-xs text-subtext0">Compiles from source. Takes 2–5 minutes. Requires Rust 1.75+.</p>
          </div>
        </div>

        <!-- Windows -->
        <div :id="ids.windows" :data-id="ids.windows" class="scroll-mt-24 space-y-4">
          <h3 class="text-lg font-bold text-text">Windows</h3>
          <div :id="ids.winWinget" :data-id="ids.winWinget" class="scroll-mt-24 space-y-2">
            <h4 class="text-sm font-bold text-mauve">winget (recommended)</h4>
            <p class="text-sm text-subtext0">winget ships with Windows 10 (1709+) and Windows 11. Open PowerShell or Command Prompt:</p>
            <CodeBlock lang="powershell" tint :code="win.winget" />
            <Collapsible title="winget not found?">
              <p class="text-sm text-subtext0">winget ships with the App Installer package. Install
                <em>App Installer</em> by Microsoft from the Microsoft Store, or update Windows.</p>
            </Collapsible>
          </div>
          <div :id="ids.winPs" :data-id="ids.winPs" class="scroll-mt-24 space-y-2">
            <h4 class="text-sm font-bold text-mauve">PowerShell (one-liner)</h4>
            <p class="text-sm text-subtext0">The Windows equivalent of the curl installer. Paste into
              PowerShell — it downloads the latest <code>splice.exe</code> and adds it to PATH, per-user,
              no admin:</p>
            <CodeBlock lang="powershell" tint :code="win.psOneLiner" />
            <p class="text-xs text-subtext0">Prefer to read it first?
              <a class="text-blue hover:underline" :href="win.psUrl">install.ps1</a></p>
            <Collapsible title="What the script does (run it manually)">
              <p class="text-sm text-subtext0 mb-2">Same steps as the one-liner, if you'd rather paste the
                script yourself:</p>
              <CodeBlock lang="powershell" tint :code="win.psScript" />
            </Collapsible>
            <Collapsible title="Execution policy error?">
              <CodeBlock lang="powershell" tint :code="'Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser'" />
              <p class="text-sm text-subtext0 mt-1">Then re-run the installer.</p>
            </Collapsible>
          </div>
          <div :id="ids.winManual" :data-id="ids.winManual" class="scroll-mt-24 space-y-2">
            <h4 class="text-sm font-bold text-mauve">Manual</h4>
            <ol class="list-decimal list-inside text-sm text-subtext0 space-y-1">
              <li>Visit <a class="text-blue hover:underline" :href="releasesUrl">the latest release</a></li>
              <li>Download <code>splice-windows-x86_64.exe</code></li>
              <li>Rename it to <code>splice.exe</code></li>
              <li>Move it to a folder on your PATH, e.g. <code>C:\Users\You\bin\</code></li>
              <li>Add that folder to PATH: Start → "Environment Variables" → Edit "Path" under
                User variables → New → paste the folder path → OK</li>
              <li>Restart your terminal</li>
              <li>Verify: <code>splice --version</code></li>
            </ol>
            <p class="text-xs text-subtext0">Requires
              <a class="text-blue hover:underline" href="https://aka.ms/vs/17/release/vc_redist.x64.exe">Visual C++ Redistributable 2019+</a>.</p>
          </div>
        </div>

        <!-- npm -->
        <div :id="ids.npm" :data-id="ids.npm" class="scroll-mt-24 space-y-2">
          <h3 class="text-lg font-bold text-text">npm</h3>
          <CodeBlock lang="bash" :code="npmCode" />
          <p class="text-sm text-subtext0"><code>@codonsplice/cli</code> detects your OS and CPU at
            install time and downloads the matching prebuilt binary from the
            <code>@codonsplice/cli-{platform}</code> sub-package. No Rust toolchain or manual PATH
            configuration required.</p>
        </div>

        <!-- Verify -->
        <div :id="ids.verify" :data-id="ids.verify" class="scroll-mt-24 space-y-2">
          <h3 class="text-lg font-bold text-text">Verify installation</h3>
          <CodeBlock lang="bash" prompt :code="'splice --version'" />
          <OutputBlock :code="'splice 0.2.6'" />
          <CodeBlock lang="bash" prompt :code="'splice'" />
          <CodeBlock lang="bash" prompt :code="verifyCheck" />
          <OutputBlock :code="'(no output = check passed)'" />
          <CodeBlock lang="bash" prompt :code="verifyCompile" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import CodeBlock from './CodeBlock.vue'
import OutputBlock from './OutputBlock.vue'
import Collapsible from './Collapsible.vue'

const REL = 'https://github.com/Pogo-Bash/codonsplice/releases/latest/download'
const releasesUrl = 'https://github.com/Pogo-Bash/codonsplice/releases/latest'

const ids = {
  quick: 'install-quick',
  macos: 'install-macos', macosArm: 'install-macos-arm', macosX86: 'install-macos-x86',
  linux: 'install-linux', linuxX86: 'install-linux-x86', linuxArm: 'install-linux-arm', linuxCargo: 'install-linux-cargo',
  windows: 'install-windows', winWinget: 'install-windows-winget', winPs: 'install-windows-powershell', winManual: 'install-windows-manual',
  npm: 'install-npm', verify: 'install-verify',
}

const tree = [
  { id: ids.quick, label: 'Quick Install' },
  { id: ids.macos, label: 'macOS', children: [
    { id: ids.macosArm, label: 'Apple Silicon' }, { id: ids.macosX86, label: 'Intel' }] },
  { id: ids.linux, label: 'Linux', children: [
    { id: ids.linuxX86, label: 'x86_64' }, { id: ids.linuxArm, label: 'aarch64' }, { id: ids.linuxCargo, label: 'Via cargo' }] },
  { id: ids.windows, label: 'Windows', children: [
    { id: ids.winWinget, label: 'winget' }, { id: ids.winPs, label: 'PowerShell' }, { id: ids.winManual, label: 'Manual' }] },
  { id: ids.npm, label: 'npm' },
  { id: ids.verify, label: 'Verify' },
]

const platformLinks = [
  { id: ids.macos, label: 'macOS' }, { id: ids.linux, label: 'Linux' }, { id: ids.windows, label: 'Windows' },
]

// ── per-platform code ────────────────────────────────────────────────────
const linuxInstaller = `curl -fsSL ${REL}/install.sh | sh`
const mac = {
  arm: `# Guided installer (recommended) — downloads the Apple Silicon
# binary, installs to ~/.local/bin, no sudo
curl -fsSL ${REL}/install.sh | sh

# Or via npm (pulls @codonsplice/cli-darwin-arm64)
npm install -g @codonsplice/cli

# Manual binary
curl -fsSL ${REL}/splice-macos-aarch64.tar.gz | tar xz
sudo mv splice /usr/local/bin/
splice --version

# Build from source — fallback only; run as your normal
# user, NOT sudo/root (avoids cargo/target ownership issues)
cargo install codonsplice`,
  x86: `# Guided installer (recommended) — downloads the Intel
# binary, installs to ~/.local/bin, no sudo
curl -fsSL ${REL}/install.sh | sh

# Or via npm (pulls @codonsplice/cli-darwin-x64)
npm install -g @codonsplice/cli

# Manual binary
curl -fsSL ${REL}/splice-macos-x86_64.tar.gz | tar xz
sudo mv splice /usr/local/bin/
splice --version

# Build from source — fallback only; run as your normal
# user, NOT sudo/root (avoids cargo/target ownership issues)
cargo install codonsplice`,
}
const linux = {
  x86Manual: `# Manual binary
curl -fsSL ${REL}/splice-linux-x86_64.tar.gz | tar xz
sudo mv splice /usr/local/bin/

# Via cargo
cargo install codonsplice`,
  armManual: `# Manual binary
curl -fsSL ${REL}/splice-linux-aarch64.tar.gz | tar xz
sudo mv splice /usr/local/bin/`,
  cargo: `# Install Rust if needed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install CodonSplice
cargo install codonsplice`,
}
const win = {
  winget: `winget install Pogo-Bash.CodonSplice

splice --version`,
  psUrl: `${REL}/install.ps1`,
  psOneLiner: `irm ${REL}/install.ps1 | iex`,
  psScript: `# CodonSplice PowerShell installer
$ErrorActionPreference = "Stop"

$repo  = "Pogo-Bash/codonsplice"
$asset = "splice-windows-x86_64.exe"

# Detect administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] \`
  [Security.Principal.WindowsIdentity]::GetCurrent() \`
).IsInRole( \`
  [Security.Principal.WindowsBuiltInRole]::Administrator)

# Choose install directory
$installDir = if ($isAdmin) {
  "C:\\Program Files\\CodonSplice"
} else {
  "$env:LOCALAPPDATA\\CodonSplice"
}

# Fetch latest release
Write-Host "Fetching latest CodonSplice release..."
$release = Invoke-RestMethod \`
  "https://api.github.com/repos/$repo/releases/latest"
$url = ($release.assets |
  Where-Object { $_.name -eq $asset }
).browser_download_url

if (-not $url) {
  Write-Error "Could not find $asset in latest release"
  exit 1
}

# Download
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$dest = Join-Path $installDir "splice.exe"
Write-Host "Downloading $asset..."
Invoke-WebRequest -Uri $url -OutFile $dest

# Add to PATH
$scope = if ($isAdmin) { "Machine" } else { "User" }
$cur = [Environment]::GetEnvironmentVariable("PATH", $scope)
if ($cur -notlike "*$installDir*") {
  [Environment]::SetEnvironmentVariable( \`
    "PATH", "$cur;$installDir", $scope)
  Write-Host "Added $installDir to $scope PATH"
}

# Verify
$v = & $dest --version 2>&1
Write-Host "Installed: $v"
Write-Host "Restart your terminal for PATH to update."`,
}
const npmCode = `# Global CLI (auto-downloads the binary for your platform)
npm install -g @codonsplice/cli

# WASM package
npm install @codonsplice/wasm

# Framework integrations
npm install @codonsplice/react
npm install @codonsplice/vue
npm install @codonsplice/svelte
npm install @codonsplice/astro`
const verifyCheck = `splice check 'FROM bam "sample.bam" CALL variants'`
const verifyCompile = `splice compile 'FROM bam "sample.bam" WHERE depth > 30 CALL variants WITH min_af = 0.05'`

// ── OS detection ─────────────────────────────────────────────────────────
const detected = ref(null)
const recommend = computed(() => {
  const os = detected.value?.os
  if (os === 'Windows') return { lang: 'powershell', cmd: 'winget install Pogo-Bash.CodonSplice', tealCallout: false }
  // macOS (Apple Silicon + Intel), Linux, and fallback default all use the
  // guided installer — it detects OS/arch and downloads the matching prebuilt
  // binary (no Homebrew formula; no sudo).
  return { lang: 'sh', cmd: linuxInstaller, tealCallout: true }
})

function detectOS() {
  const s = `${navigator.userAgent} ${navigator.platform || ''}`.toLowerCase()
  if (/mac/.test(s)) {
    const arm = /arm/.test(s) || (navigator.maxTouchPoints || 0) > 1
    return { os: 'macOS', label: `macOS ${arm ? 'Apple Silicon' : 'Intel'}`, anchor: arm ? ids.macosArm : ids.macosX86 }
  }
  if (/win/.test(s)) return { os: 'Windows', label: 'Windows', anchor: ids.windows }
  if (/linux|x11|android/.test(s)) {
    const arm = /arm|aarch64/.test(s)
    return { os: 'Linux', label: `Linux ${arm ? 'aarch64' : 'x86_64'}`, anchor: arm ? ids.linuxArm : ids.linuxX86 }
  }
  return null
}

// ── tree expand/collapse + scroll-spy ────────────────────────────────────
const expanded = ref(new Set())
const activeId = ref(ids.quick)

const isExpanded = (id) => expanded.value.has(id)
function toggle(id) {
  const n = new Set(expanded.value)
  n.has(id) ? n.delete(id) : n.add(id)
  expanded.value = n
}
function onNodeClick(node) {
  if (node.children) toggle(node.id)
  scrollTo(node.id)
}
function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const activeParent = computed(() =>
  tree.find((n) => n.id === activeId.value || n.children?.some((c) => c.id === activeId.value)))
const topActive = computed(() => activeParent.value?.id)

let observer = null
onMounted(() => {
  detected.value = detectOS()
  if (detected.value) {
    // Auto-expand the detected platform's parent.
    const parent = tree.find((n) => n.children?.some((c) => c.id === detected.value.anchor))
    if (parent) toggle(parent.id)
  }

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting)
      if (visible.length) {
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const id = visible[0].target.dataset.id
        if (id) {
          activeId.value = id
          // Keep the active parent expanded.
          const parent = tree.find((n) => n.children?.some((c) => c.id === id) || n.id === id)
          if (parent?.children && !expanded.value.has(parent.id)) toggle(parent.id)
        }
      }
    },
    { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
  )
  document.querySelectorAll('[data-id^="install-"]').forEach((el) => observer.observe(el))
})
onBeforeUnmount(() => observer?.disconnect())
</script>
