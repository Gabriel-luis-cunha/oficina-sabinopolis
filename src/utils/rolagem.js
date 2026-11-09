// =============================================================
// Trava a rolagem da página enquanto um modal ou foto ampliada
// está aberto. Usa um contador porque um pode abrir por cima do
// outro: a rolagem só volta quando TODOS forem fechados.
// =============================================================
let travas = 0;

/** Trava a rolagem e devolve a função que destrava */
export function travarRolagem() {
  travas += 1;
  document.body.classList.add('sem-rolagem');

  let liberado = false;
  return function destravar() {
    if (liberado) return;
    liberado = true;
    travas -= 1;
    if (travas === 0) document.body.classList.remove('sem-rolagem');
  };
}
