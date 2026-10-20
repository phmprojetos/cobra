/** Erro de regra de negócio: mensagem pensada para ser exibida ao usuário. */
export class ErroRegra extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroRegra';
  }
}
