// Par do shim de node-fetch: o fetch nativo exige o AbortSignal nativo.
export const AbortController = globalThis.AbortController;
export const AbortSignal = globalThis.AbortSignal;
export default AbortController;
