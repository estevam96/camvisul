# Design de Interface e Experiência do Usuário (UI/UX)

## 1. Princípios de Design

O usuário solicitou explicitamente:
> *"Use uma interface bonita, clean e moderna"*

A interface do **CamVisul** foi projetada com base nos princípios de interfaces de ponta de videomonitoramento profissional (semelhante ao Apple Home, UniFi Protect e Google Nest), combinando estética moderna, contraste balanceado e clareza de uso.

### Diretrizes Estéticas:
- **Tema Escuro Moderno (Dark Surveillance Theme):** Fundo cinza profundo (`#0b0f17` e `#111827`) que valoriza a imagem da câmera e minimiza o cansaço visual.
- **Glassmorphism Suave:** Cartões e barras de controle com `backdrop-filter: blur(12px)`, bordas sutis translúcidas (`rgba(255, 255, 255, 0.08)`) e sombras suaves.
- **Micro-interações e Feedback Visual:** Animações sutis em estados de foco, hover e pulsos de status (ponto verde piscando para status "Conectada / Ao Vivo").
- **Tipografia Moderna:** Fontes sem serifa limpas do sistema (`-apple-system`, `BlinkMacSystemFont`, `Inter`, `Segoe UI`).

---

## 2. Conformidade com as Diretrizes Modern Web Guidance

Seguindo rigorosamente as recomendações do guia moderno da web:

1. **Modal Nativo `<dialog>`:**
   - O modal de login e configurações utiliza o elemento nativo `<dialog id="login-modal">`, sem criar divs artificiais para acessibilidade.
   - Respeita o foco nativo e tecla `Esc`.
   - Adiciona proteção contra rolagem de fundo sem quebrar o layout:
     ```css
     dialog:modal {
       overscroll-behavior: contain;
     }
     dialog::backdrop {
       overflow: hidden;
       overscroll-behavior: contain;
       background: rgba(0, 0, 0, 0.65);
       backdrop-filter: blur(8px);
     }
     ```
2. **Suporte a Esquema de Cores (`color-scheme`):**
   - Inclusão de `<meta name="color-scheme" content="light dark">` no `<head>` para evitar Flash of Unstyled Content (FOUC).
   - Definição de tokens de cor utilizando propriedades customizadas e suporte a adaptações dinâmicas.

---

## 3. Estrutura do Layout

```
+-------------------------------------------------------------------------+
| [● Besder Live]  Besder IP Cam • 192.168.x.x    [1080p HD]  [Config/Sair]|
+-------------------------------------------------------------------------+
|                                                                         |
|                                                                         |
|                         CANVAS DE VÍDEO PRINCIPAL                       |
|                       (Player WebRTC Baixa Latência)                    |
|                                                                         |
|                                                                         |
|  [Overlay: Hora / Cam Name / Ponto Verde "AO VIVO"]                    |
|  [Overlay Flutuante: "🔊 Clique para Ativar Áudio" (se muted)]          |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | [Play/Pause] [HD/SD] [Mute/Vol] [Audio Meter: ▰▰▰▱▱] [Snap] [Full] |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
| [D-Pad PTZ (Pan/Tilt/Zoom)]  | [Diagnósticos da Câmera] | [Capturas Rec]|
|        ▲                     | IP: 192.168.x.x          | [Miniaturas]  |
|     ◄  ●  ►                  | Resolução: 1920x1080     |               |
|        ▼        [+][-]       | Latência: ~140ms         |               |
+-------------------------------------------------------------------------+
```

---

## 4. Recursos Interativos

1. **Troca Rápida de Resolução:** Alternância dinâmica de stream entre Full HD (stream0) e Fluido SD (stream1) sem precisar reconectar.
2. **Medidor Visual de Áudio (Audio Meter):** Barra dinâmica que oscila com o volume real captado pelo microfone da câmera.
3. **Snapshot com Download Imediato:** Botão que baixa no computador a foto capturada com nome formatado (ex: `besder-cam_2026-11-03_15-30-00.jpg`).
4. **Modo Tela Cheia Imersivo:** Ocupa todo o monitor com controles translúcidos ocultáveis automaticamente.
