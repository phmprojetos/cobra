import { Cabecalho } from '@/components/cabecalho';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { carregarPainel } from '@/lib/painel';
import { FormGeral, FormRegra } from './formularios';

export default async function Configuracoes() {
  const { repo, config, carteira } = await carregarPainel();
  const regras = await repo.regras();
  const clientes = [...carteira.clientes.values()].filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }));
  return (
    <>
      <Cabecalho titulo="Configurações" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Geral</CardTitle>
          <CardDescription>Valem para o painel e para o bot.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormGeral
            moeda={config.moeda}
            locale={config.locale}
            timezone={config.timezone}
            estrategia={config.estrategiaAlocacao}
            silencio={config.silencio}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificações no Telegram</CardTitle>
          <CardDescription>Avaliadas a cada 15 minutos. Cada alerta é enviado uma única vez.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {regras.map((r) => (
            <FormRegra
              key={r.id}
              clientes={clientes}
              regra={{
                id: r.id,
                tipo: r.tipo,
                offset_dias: r.offset_dias,
                horario: r.horario.slice(0, 5),
                dia_semana: r.dia_semana,
                ativo: r.ativo,
                silenciar_clientes: r.silenciar_clientes,
              }}
            />
          ))}
          <FormRegra
            clientes={clientes}
            regra={{ id: null, tipo: 'atraso', offset_dias: 14, horario: '10:00', dia_semana: 1, ativo: true, silenciar_clientes: [] }}
          />
        </CardContent>
      </Card>
    </>
  );
}
