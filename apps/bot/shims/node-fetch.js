// Substitui o node-fetch (usado pelo grammY no Node) pelo fetch nativo no bundle de produção:
// empacotado pelo esbuild, o node-fetch trava na primeira chamada à API do Telegram.
export default globalThis.fetch;
