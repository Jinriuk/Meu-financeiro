// Movimento da página de vendas (CSP: script-src 'self' — nada inline).
// Progressive enhancement: sem JS a página aparece inteira, estática.
(function () {
  var doc = document.documentElement;
  doc.classList.add('js');

  // revela elementos .rv quando entram na tela (uma vez só)
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -48px 0px' });
  document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });

  // header ganha fundo/sombra depois que a página rola
  var header = document.querySelector('header');
  var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 10); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
