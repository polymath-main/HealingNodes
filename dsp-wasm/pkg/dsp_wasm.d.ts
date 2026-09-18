/* tslint:disable */
/* eslint-disable */

export class BiquadFilter {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    process(input: number): number;
    set_highpass(freq: number, sample_rate: number): void;
}

export class LinkwitzRiley4 {
    free(): void;
    [Symbol.dispose](): void;
    constructor(freq: number, sample_rate: number);
    process(input: number): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_biquadfilter_free: (a: number, b: number) => void;
    readonly __wbg_linkwitzriley4_free: (a: number, b: number) => void;
    readonly biquadfilter_new: () => number;
    readonly biquadfilter_process: (a: number, b: number) => number;
    readonly biquadfilter_set_highpass: (a: number, b: number, c: number) => void;
    readonly linkwitzriley4_new: (a: number, b: number) => number;
    readonly linkwitzriley4_process: (a: number, b: number) => number;
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
