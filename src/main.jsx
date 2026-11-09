// Ponto de entrada do React: "monta" o App dentro da <div id="root"> do index.html
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// HashRouter (endereços com #) funciona no GitHub Pages, que não sabe
// entregar o site quando a pessoa recarrega uma página como /clientes/3
import { HashRouter } from 'react-router';

// Fontes instaladas pelo npm (funcionam mesmo sem internet)
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '@fontsource/archivo/800.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/global.css';

import App from './App.jsx';
import { ProvedorAvisos } from './components/Aviso.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <ProvedorAvisos>
        <App />
      </ProvedorAvisos>
    </HashRouter>
  </StrictMode>,
);
