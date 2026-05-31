/* tslint:disable */
/* eslint-disable */

/**
 * Coverage + CNV analysis. `opts_json` is the snake_case `CoverageOptions`
 * JSON; returns the result object as a JSON string.
 */
export function analyze_coverage(bam: Uint8Array, bai: Uint8Array, opts_json: string): string;

/**
 * SNV variant calling. `opts_json` is the snake_case `VariantOptions` JSON.
 */
export function call_variants(bam: Uint8Array, bai: Uint8Array, opts_json: string): string;

/**
 * One-time panic-hook install so Rust panics surface in the JS console.
 */
export function init(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly analyze_coverage: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly call_variants: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly init: () => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
