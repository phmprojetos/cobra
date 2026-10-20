/**
 * Transcrição de áudio (mensagens de voz do Telegram) para texto, que segue o fluxo normal.
 * Implementação: Groq (Whisper), barata e rápida em português. Ativada só com GROQ_API_KEY.
 */
export interface Transcritor {
  transcrever(audio: Uint8Array, nomeArquivo: string): Promise<string | null>;
}

export class TranscritorGroq implements Transcritor {
  constructor(
    private readonly apiKey: string,
    private readonly modelo = 'whisper-large-v3-turbo',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcrever(audio: Uint8Array, nomeArquivo: string): Promise<string | null> {
    const form = new FormData();
    form.append('file', new Blob([audio]), nomeArquivo);
    form.append('model', this.modelo);
    form.append('language', 'pt');
    form.append('response_format', 'json');
    // Vocabulário do domínio ajuda com valores e termos ("pix", "parcelas").
    form.append('prompt', 'Empréstimo, pagamento, parcelas, vencimento, reais, pix. Ex.: emprestei 2000 pro Carlos, volta 2400 dia 15/12.');
    const res = await this.fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Transcrição falhou: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const texto = ((await res.json()) as { text?: string }).text?.trim();
    return texto ? texto : null;
  }
}
