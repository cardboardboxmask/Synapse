import { Idea } from '../types/synapse';

/**
 * 6 software-first starter ideas authored by @founder to seed the registry
 * so a first visitor sees genuine starter proposals with real 0-initialized counters.
 */
export const SEED_IDEAS: Idea[] = [
  {
    id: 'seed-localmesh',
    title: 'LocalMesh: Offline-first neighborhood emergency alert network via ESP32',
    summary:
      'In natural disasters, cellular networks fail first. LocalMesh creates an autonomous radio relay and zero-config captive portal web UI using sub-GHz LoRa and ESP32 nodes to route crisis telemetry.',
    problem:
      'Cellular infrastructure is the first point of failure during extreme weather events and floods. Neighborhoods lose mutual aid communication precisely when it is most urgently needed. In regional storms, thousands of households are blacked out from emergency dispatch lines despite physically being within 800 meters of operational community centers.',
    solution:
      'A solar-charged ESP32 mesh node network using sub-GHz LoRa radios (915MHz / 868MHz ISM band) that broadcasts neighborhood wellness checks, water levels, and emergency requests across 1.2–5.0km hops without internet. Each node spins up a zero-config HTTP Captive Portal over WiFi AP so neighbors can post or read alerts from any phone browser without installing a prior mobile app.',
    helpWanted:
      'Looking for an embedded C++ / MicroPython developer comfortable with Meshtastic packet flooding protocols, deep-sleep power optimization (< 18uA standby), and lightweight captive-portal HTML/JS serving over ESP-IDF.',
    existingCheckNote:
      'Meshtastic exists for peer-to-peer texting, but requires Bluetooth pairing and dedicated app installation before an outage. LocalMesh auto-spins an open HTTP Captive Portal on any phone browser via ESP32 soft-AP and includes ultrasonic water-depth telemetry endpoints.',
    category: 'Hardware',
    tags: ['hardware', 'iot', 'offline-first', 'opensource'],
    helpTrack: 'builder',
    status: 'open',
    license: 'mit',
    authorId: 'founder',
    authorName: 'Solo Maker & Curator',
    authorUsername: 'founder',
    isSeed: true,
    responseCount: 0,
    volunteerCount: 0,
    connectionCount: 0,
    communityCheckSimilar: 0,
    communityCheckNew: 0,
    createdAt: '2026-09-24T10:00:00.000Z',
    updatedAt: '2026-09-24T10:00:00.000Z',
  },
  {
    id: 'seed-openpaperclip',
    title: 'OpenPaperclip: Open grant pipeline for independent researchers',
    summary:
      'Minimalist markdown-based schema and CLI tool for independent researchers, post-docs, and solo tinkerers to format, cross-verify compliance, and publish grant proposals openly.',
    problem:
      'Independent researchers and open-source builders outside traditional university walls face opaque, proprietary grant portals that lock applications inside legacy PDF forms and siloed review queues. Valuable research hypotheses die in closed administrative pipelines without peer cross-pollination.',
    solution:
      'A deterministic Markdown/YAML grant specification and TypeScript CLI validator that compiles plain-text research proposals into standardized, cryptographically timestamped public artifacts. Micro-grant foundations and peer reviewers can subscribe to domain feeds and issue lightweight advisory notes directly via git or web hooks.',
    helpWanted:
      'Seeking technical guidance and architecture review from academic grant reviewers or CLI tool authors on schema extensibility, citation verification, and JSON-Schema validation rules.',
    existingCheckNote:
      'Traditional systems like Grants.gov or institutional CRIS portals are built for university compliance departments rather than solo researchers publishing open-access micro-grant specs.',
    category: 'Software',
    tags: ['software', 'academia', 'transparency', 'opensource'],
    helpTrack: 'guidance',
    status: 'open',
    license: 'mit',
    authorId: 'founder',
    authorName: 'Solo Maker & Curator',
    authorUsername: 'founder',
    isSeed: true,
    responseCount: 0,
    volunteerCount: 0,
    connectionCount: 0,
    communityCheckSimilar: 0,
    communityCheckNew: 0,
    createdAt: '2026-09-25T14:30:00.000Z',
    updatedAt: '2026-09-25T14:30:00.000Z',
  },
  {
    id: 'seed-promptdiff',
    title: 'PromptDiff: Deterministic regression testing suite for local LLM pipelines',
    summary:
      'Lightweight assertion framework to benchmark latency, structural drift, and JSON schema adherence across quantized GGUF model weights running on consumer hardware.',
    problem:
      'Developers building local-first software with small quantized models struggle to detect subtle regressions when swapping GGUF quantization levels or updating system prompts. Existing evaluation suites assume cloud API budgets and heavy Python dependencies.',
    solution:
      'A zero-telemetry local CLI runner written in Python and Rust that executes declarative YAML test fixtures against local llama.cpp or Ollama endpoints. It outputs a visual terminal diff of token latency, deterministic seed variance, and structured output conformance across commits.',
    helpWanted:
      'Looking for architectural guidance on statistical similarity scoring for non-deterministic temperature>0 runs and ergonomic CLI configuration patterns.',
    existingCheckNote:
      'Promptfoo and DeepEval are comprehensive, but PromptDiff focuses specifically on zero-cloud GGUF quantization diffs and memory-footprint profiling on local consumer GPUs.',
    category: 'AI',
    tags: ['ai', 'software', 'devtools', 'python'],
    helpTrack: 'guidance',
    status: 'open',
    license: 'mit',
    authorId: 'founder',
    authorName: 'Solo Maker & Curator',
    authorUsername: 'founder',
    isSeed: true,
    responseCount: 0,
    volunteerCount: 0,
    connectionCount: 0,
    communityCheckSimilar: 0,
    communityCheckNew: 0,
    createdAt: '2026-09-26T09:15:00.000Z',
    updatedAt: '2026-09-26T09:15:00.000Z',
  },
  {
    id: 'seed-syncshelf',
    title: 'SyncShelf: P2P decentralized book reservation network for rural community rooms',
    summary:
      'Hyper-local, zero-cloud catalog web application utilizing browser-to-browser WebRTC and SQLite sync to help remote libraries and community rooms share physical volumes with zero hosting costs.',
    problem:
      'Rural reading rooms, tool libraries, and neighborhood book swaps cannot afford recurring SaaS library management subscriptions or dedicated cloud servers, leading to fragmented paper ledgers and lost inventory.',
    solution:
      'An offline-capable progressive web app backed by SQLite-in-WASM (OPFS) and CRDT sync over WebRTC/local LAN. Community stewards scan ISBN barcodes with a phone camera, and catalogs automatically reconcile whenever two member devices connect at weekly markets or town halls.',
    helpWanted:
      'Needs a frontend/web builder experienced with IndexedDB/OPFS storage, CRDT state merging (Yjs or Automerge), and clean barcode scanning UI.',
    existingCheckNote:
      'Koha and Evergreen require dedicated Linux server administration. SyncShelf runs entirely in local browser storage with peer-to-peer sync and zero monthly server bills.',
    category: 'Web',
    tags: ['web', 'community', 'p2p', 'opensource'],
    helpTrack: 'builder',
    status: 'open',
    license: 'cc-by',
    authorId: 'founder',
    authorName: 'Solo Maker & Curator',
    authorUsername: 'founder',
    isSeed: true,
    responseCount: 0,
    volunteerCount: 0,
    connectionCount: 0,
    communityCheckSimilar: 0,
    communityCheckNew: 0,
    createdAt: '2026-09-26T18:45:00.000Z',
    updatedAt: '2026-09-26T18:45:00.000Z',
  },
  {
    id: 'seed-solarstitch',
    title: 'SolarStitch: Low-cost solar thermal sensor logger for open greenhouses',
    summary:
      'Open firmware and schematics for a durable, non-proprietary capacitive soil moisture and ambient heat logger capable of multi-year uninterrupted logging on recycled 18650 cells.',
    problem:
      'Small urban farms and community greenhouses either buy expensive proprietary agricultural IoT sensors locked behind subscription dashboards or rely on fragile hobbyist breadboards that corrode within a single growing season.',
    solution:
      'An open-hardware sensor probe and C++ firmware stack with conformal-coated PCB layout, MPPT trickle charging for salvaged 18650 lithium cells, and local CSV export over WiFi/BLE so growers own 100% of their micro-climate time-series data.',
    helpWanted:
      'Needs guidance from firmware and power-electronics engineers on BMS undervoltage cutoff hysteresis and capacitive probe frequency calibration across soil types.',
    existingCheckNote:
      'Consumer smart-garden sensors lock historical CSV exports behind cloud accounts. SolarStitch outputs raw open telemetry directly to any local phone or laptop.',
    category: 'Hardware',
    tags: ['hardware', 'agriculture', 'open-hardware', 'opensource'],
    helpTrack: 'guidance',
    status: 'open',
    license: 'mit',
    authorId: 'founder',
    authorName: 'Solo Maker & Curator',
    authorUsername: 'founder',
    isSeed: true,
    responseCount: 0,
    volunteerCount: 0,
    connectionCount: 0,
    communityCheckSimilar: 0,
    communityCheckNew: 0,
    createdAt: '2026-09-27T11:20:00.000Z',
    updatedAt: '2026-09-27T11:20:00.000Z',
  },
  {
    id: 'seed-formless',
    title: 'Formless: Plaintext markdown schema builder for clinical trial protocols',
    summary:
      'Translating bloated FDA-compliant PDF forms into git-versioned YAML/Markdown artifacts so decentralized medical trials and independent labs can sync methodology cleanly.',
    problem:
      'Clinical research protocols and informed-consent questionnaires are frequently authored in 200-page Word/PDF documents, making version diffing, multi-site translation, and electronic data capture (EDC) form generation slow and error-prone.',
    solution:
      'A web-based split-pane schema editor that compiles human-readable Markdown protocol definitions into CDISC ODM-compatible JSON/YAML schemas and accessible HTML intake forms with full git diff history.',
    helpWanted:
      'Needs a TypeScript/React builder to implement the live Markdown AST parser, form preview renderer, and schema export pipeline.',
    existingCheckNote:
      'REDCap is powerful for large hospital networks but uses legacy tabular configuration rather than git-native plaintext Markdown specifications.',
    category: 'Software',
    tags: ['software', 'web', 'health', 'markdown'],
    helpTrack: 'builder',
    status: 'open',
    license: 'all-rights-kept',
    authorId: 'founder',
    authorName: 'Solo Maker & Curator',
    authorUsername: 'founder',
    isSeed: true,
    responseCount: 0,
    volunteerCount: 0,
    connectionCount: 0,
    communityCheckSimilar: 0,
    communityCheckNew: 0,
    createdAt: '2026-09-27T19:00:00.000Z',
    updatedAt: '2026-09-27T19:00:00.000Z',
  },
];
