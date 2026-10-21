import Link from 'next/link';
import { Cabecalho } from '@/components/cabecalho';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MODO_DEMO } from '@/lib/demo';
import { carregarPainel } from '@/lib/painel';
import { sessaoPainel } from '@/lib/supabase/painel';
import { FormGeral, FormRegra } from './formularios';
import { VinculosTelegram, type Vinculo } from './telegram';

export default async function Configuracoes() {
  const { repo, config, carteira } = await carregarPainel();
  const regras = await repo.regras();
  const clientes = [...carteira.clientes.values()].filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }));
  const acesso = MODO_DEMO ? null : await carregarAcesso();
  return (
    <>
      <Cabecalho titulo="Configurações" subtitulo="Moeda, fuso, alocação de pagamentos e alertas do Telegram" />
      {acesso && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Telegram</CardTitle>
              <CardDescription>Quem pode usar o bot com a carteira <b>{acesso.carteira}</b>.</CardDescription>
            </CardHeader>
            <CardContent>
              <VinculosTelegram vinculos={acesso.vinculos} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usuários do painel</CardTitle>
              <CardDescription>Todos têm as mesmas permissões e veem só esta carteira.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-lg border text-sm">
                {acesso.membros.map((m) => (
                  <li key={m.email} className="flex items-center justify-between px-3 py-2">
                    <span className="truncate">{m.email}</span>
                    {m.voce && <span className="text-muted-foreground text-xs">você</span>}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-3 text-xs">
                Novos usuários são criados pelo administrador do sistema: <code>pnpm usuario:criar email</code>.
              </p>
              <Link href="/redefinir-senha" className="mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline">
                Alterar minha senha
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
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
          <CardDescription>
            Avaliadas a cada 15 minutos. Cada alerta é enviado uma única vez.{' '}
            {config.canalAlertas ? (
              <>
                Destino: canal <b>{config.canalAlertas.titulo}</b> (alertas agrupados).
              </>
            ) : (
              <>Destino: seu chat privado. Para usar um canal, adicione o bot como administrador do canal (veja /canal no bot).</>
            )}
          </CardDescription>
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

async function carregarAcesso() {
  const { db, user, carteiraNome } = await sessaoPainel();
  const [vinculos, membros] = await Promise.all([
    db.from('vinculos_telegram').select('telegram_user_id, nome, created_at').order('created_at'),
    db.from('membros').select('user_id, email').order('created_at'),
  ]);
  return {
    carteira: carteiraNome,
    vinculos: (vinculos.data ?? []) as Vinculo[],
    membros: (membros.data ?? []).map((m) => ({ email: m.email, voce: m.user_id === user.id })),
  };
}
