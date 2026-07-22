// Página de obrigado pós-checkout Hotmart (CSP: script-src 'self' — nada inline).
// A Hotmart anexa parâmetros na URL da página externa; lemos o status pra adaptar a
// mensagem. Sem parâmetro reconhecível, fica a versão genérica (pedido recebido).
(function () {
  var q = new URLSearchParams(location.search);
  var raw = (q.get('status') || q.get('purchase_status') || q.get('transaction_status') || '').toLowerCase();
  var st = 'generic';
  if (/approved|complete|paid/.test(raw)) st = 'ok';
  else if (/wait|billet|pending|printed|pix/.test(raw)) st = 'wait';
  else if (/analys|analis|review/.test(raw)) st = 'review';
  var el = document.getElementById('st-' + st) || document.getElementById('st-generic');
  if (el) el.hidden = false;
  var gen = document.getElementById('st-generic');
  if (el && gen && el !== gen) gen.hidden = true;   // status específico substitui o genérico
  document.documentElement.classList.add('js');
})();
