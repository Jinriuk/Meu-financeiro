// Time de exemplo pros testes de tela (dados inventados): Samba > Base > Reco-reco e Cavaquinho, 4 alunos, uma professora convidada,
// saque, reload e planilha pendentes, grades (uma simulada) e torneios dos últimos dias. papel: admin | prof | fin | aluno.
import { dbBase } from './harness.mjs';
export const EU = '00000000-0000-0000-0000-00000000aaaa';
const hoje = new Date(); const iso = d => d.toISOString().slice(0, 10);
const dia = n => { const x = new Date(hoje); x.setDate(x.getDate() - n); return iso(x); };
export const D = dia;
const G4 = [{ site: 'GGpoker', tipo: 'Semanal', regular: 'até $5,40', prog_ko: 'até $5,40', hyper: 'até $3,30 (somente vanilla)' },
  { site: 'GGpoker', tipo: 'Reentry semanal', regular: 'até $5,40', prog_ko: 'até $5,40', hyper: 'não' },
  { site: 'PokerStars', tipo: 'Semanal', regular: 'até $5,50', prog_ko: '$3,30 + Bounty Builder até $5,50', hyper: 'até $3,30' },
  { site: 'PokerStars', tipo: 'Extra', regular: '$22 Sunday Storm', prog_ko: '', hyper: '' }];
const G2 = [{ site: 'GGpoker', tipo: 'Semanal', regular: 'até $2,50 + $3 2k+', prog_ko: 'até $2,50 + $3,20 5k+', hyper: 'Até $2 (somente vanilla)' }];
const t = (id, player, pid, uid, nome, site, buyin, d, x = {}) => ({ id, workspace_id: 'w1', entry_date: d, player, pessoa_id: pid, unidade_id: uid, site, tournament_name: nome, modality: 'MTT', buyin, prize: 0, reentries: 0, field_size: 100, bounty: 0, currency: 'USD', created_at: d + 'T10:00:00Z', ...x });
export function samba(papel = 'admin', extra = {}) {
  const acesso = papel === 'admin' ? [{ pessoa_id: 'p0', unidade_id: 'u0', capacidades: ['administrar'] }]
    : papel === 'prof' ? [{ pessoa_id: 'p0', unidade_id: 'u2', capacidades: ['promover', 'ver_desempenho', 'ver_financeiro'] }]
    : papel === 'fin' ? [{ pessoa_id: 'p0', unidade_id: 'u0', capacidades: ['aprovar_saques', 'ver_financeiro'] }] : [];
  const vinculoEu = papel === 'aluno' || papel === 'prof' ? [{ pessoa_id: 'p0', unidade_id: papel === 'prof' ? 'u4' : 'u2', fim: null }] : [];
  return dbBase({
    workspaces: [{ id: 'w1', name: 'Samba', kind: 'time', plan: 'team', trial_ends_at: null, created_at: '2026-11-19T00:00:00Z' }],
    pool_config: [{ ...dbBase().pool_config[0], player1_name: '', player2_name: '', abi_max: 3, abi_max_player1: 3 }],
    unidade: [{ id: 'u0', workspace_id: 'w1', mae_id: null, nome: 'Samba', rotulo: 'Time', caminho: '/u0/', arquivada: false },
      { id: 'ub', workspace_id: 'w1', mae_id: 'u0', nome: 'Base', rotulo: 'Time de base', caminho: '/u0/ub/', arquivada: false },
      { id: 'u2', workspace_id: 'w1', mae_id: 'ub', nome: 'Reco-reco', rotulo: 'Reta 2', caminho: '/u0/ub/u2/', arquivada: false },
      { id: 'u4', workspace_id: 'w1', mae_id: 'ub', nome: 'Cavaquinho', rotulo: 'Reta 4', caminho: '/u0/ub/u4/', arquivada: false }],
    pessoa: [{ id: 'p0', workspace_id: 'w1', user_id: EU, nome: papel === 'aluno' ? 'Bruno T.' : 'Gabriel', status: 'ativo' },
      ...(papel === 'aluno' ? [] : [{ id: 'p1', workspace_id: 'w1', user_id: 'x1', nome: 'Bruno T.', status: 'ativo' }]),
      { id: 'p2', workspace_id: 'w1', user_id: 'x2', nome: 'Caio R.', status: 'ativo' },
      { id: 'p3', workspace_id: 'w1', user_id: 'x3', nome: 'Enzo P.', status: 'ativo' },
      { id: 'p4', workspace_id: 'w1', user_id: null, nome: 'Iza N.', status: 'convidado' },
      { id: 'p9', workspace_id: 'w1', user_id: null, nome: 'Prof. Rita', status: 'convidado' }],
    vinculo: [...vinculoEu, ...(papel === 'aluno' ? [] : [{ pessoa_id: 'p1', unidade_id: 'u2', fim: null }]), { pessoa_id: 'p2', unidade_id: 'u2', fim: null },
      { pessoa_id: 'p3', unidade_id: 'u4', fim: null }, { pessoa_id: 'p4', unidade_id: 'u4', fim: null }],
    acesso: [...acesso, ...(papel === 'admin' ? [{ pessoa_id: 'p9', unidade_id: 'u4', capacidades: ['promover', 'ver_desempenho', 'ver_financeiro'] }] : [])],
    grade: [{ id: 'g2', workspace_id: 'w1', unidade_id: 'u2', vigente_desde: '2026-11-16', simulada: false, celulas: G2, observacao: 'Da planilha da Reta 2' },
      { id: 'g4', workspace_id: 'w1', unidade_id: 'u4', vigente_desde: '2026-11-19', simulada: true, celulas: G4, observacao: 'Simulada: semana até $5,40' }],
    regra_unidade: [],
    tournaments: [t('t1', 'Bruno T.', papel === 'aluno' ? 'p0' : 'p1', 'u2', 'Daily Main', 'GG Poker', 2.5, dia(1)), t('t2', 'Bruno T.', papel === 'aluno' ? 'p0' : 'p1', 'u2', 'Hot $44', 'GG Poker', 44, dia(1)),
      t('t3', 'Caio R.', 'p2', 'u2', 'Daily Main', 'GG Poker', 3, dia(2)), t('t4', 'Enzo P.', 'p3', 'u4', 'Daily Main', 'GG Poker', 7.5, dia(2)), t('t5', 'Enzo P.', 'p3', 'u4', 'Sunday Storm', 'PokerStars', 22, dia(3))],
    saque: [{ id: 's1', pessoa_id: 'p1', unidade_id: 'u2', status: 'solicitado', solicitado_em: dia(0) + 'T10:00:00Z', banca: 412, mu_antes: 300, devolucao: 200, cashout: 100, parte_jogador: 35, total_time: 265, banca_depois: 112 },
      { id: 's2', pessoa_id: 'p3', unidade_id: 'u4', status: 'pago', solicitado_em: dia(9) + 'T10:00:00Z', pago_em: dia(8) + 'T10:00:00Z', devolucao: 100, cashout: 50, parte_jogador: 17.5, total_time: 132.5, recebido: 132.5, diferenca: 0 }],
    reload: [{ id: 'r1', pessoa_id: 'p2', unidade_id: 'u2', status: 'solicitado', valor: 100, sala: 'GG', motivo: 'quebrei a banca', solicitado_em: dia(0) + 'T09:00:00Z' }],
    abertura: [{ id: 'a1', pessoa_id: 'p3', unidade_id: 'u4', status: 'enviada', mu: 700, cashout: 1240, enviado_em: dia(1) + 'T10:00:00Z', planilha: { banca: 1057, lifetime: 1597, grade: G4 } }],
    convite: [{ id: 'c1', unidade_id: 'u2', pessoa_id: null, expira_em: dia(-6) + 'T10:00:00Z', usos_max: 10, usos: 2, revogado: false, criado_em: dia(1) + 'T10:00:00Z' },
      { id: 'c2', unidade_id: 'u4', pessoa_id: 'p4', expira_em: dia(-5) + 'T10:00:00Z', usos_max: 1, usos: 0, revogado: false, criado_em: dia(2) + 'T10:00:00Z' }],
    contrato: [{ id: 'k1', unidade_id: 'u0', pessoa_id: null, faixas: [{ ate: 10000, jogador: 0.35 }, { ate: null, jogador: 0.4 }], criado_em: '2026-11-19T00:00:00Z' }],
    player_wallets: papel === 'aluno' ? [{ id: 'w-1', player: 'Bruno T.', wallet: 'GG Poker', saldo_inicial: 400 }] : [],
    __rpc: {
      resumo_time: [
        ...(papel === 'aluno' ? [] : [{ pessoa_id: 'p1', nome: 'Bruno T.', unidade_id: 'u2', unidade: 'Reco-reco', caminho: '/u0/ub/u2/', status: 'ativo', torneios: 142, investido: 370, lucro: 104, roi: 28.1, abi: 2.6, ultimo_lancamento: dia(1), banca: 412, mu: 300, lucro_sacado: 90 }]),
        { pessoa_id: 'p2', nome: 'Caio R.', unidade_id: 'u2', unidade: 'Reco-reco', caminho: '/u0/ub/u2/', status: 'ativo', torneios: 98, investido: 176, lucro: -19, roi: -10.8, abi: 1.8, ultimo_lancamento: dia(9), banca: 181, mu: 300, lucro_sacado: 0 },
        { pessoa_id: 'p3', nome: 'Enzo P.', unidade_id: 'u4', unidade: 'Cavaquinho', caminho: '/u0/ub/u4/', status: 'ativo', torneios: 156, investido: 811, lucro: 357, roi: 44, abi: 5.2, ultimo_lancamento: dia(2), banca: 1057, mu: 700, lucro_sacado: 10240 },
        { pessoa_id: 'p4', nome: 'Iza N.', unidade_id: 'u4', unidade: 'Cavaquinho', caminho: '/u0/ub/u4/', status: 'convidado', torneios: 0, investido: 0, lucro: 0, roi: null, abi: null, ultimo_lancamento: null, banca: 0, mu: 0, lucro_sacado: 0 },
        ...(papel === 'prof' ? [{ pessoa_id: 'p0', nome: 'Gabriel', unidade_id: 'u4', unidade: 'Cavaquinho', caminho: '/u0/ub/u4/', status: 'ativo', torneios: 10, investido: 30, lucro: 5, roi: 16, abi: 3, ultimo_lancamento: dia(0), banca: 100, mu: 100, lucro_sacado: 0 }] : [])],
      situacao_jogador: { mu: 300, lifetime: 90, contrato: [{ ate: 10000, jogador: 0.35 }, { ate: null, jogador: 0.4 }], unidade_id: 'u2', abertura: 'confirmada' },
    },
    ...extra,
  });
}
