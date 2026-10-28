// Roda antes da primeira pintura, com o que a última visita deixou guardado:
// o tema e as cores (para o claro não piscar escuro) e o idioma (para o inglês
// não piscar português). O app.js põe os textos e tira a classe "traduzindo".
try {
  const raiz = document.documentElement;
  const tema = localStorage.getItem("horas.tema");
  if (tema) raiz.dataset.tema = tema;
  const cores = localStorage.getItem("horas.cores");
  if (cores) raiz.dataset.cores = cores;
  const idioma = localStorage.getItem("horas.idioma");
  if (idioma && idioma !== "pt") raiz.classList.add("traduzindo");
} catch {
  // sem localStorage: vale o padrão do HTML
}
