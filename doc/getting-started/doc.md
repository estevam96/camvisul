# Guia de Inicialização e Uso - CamVisul

## 1. Pré-requisitos

- **Sistema Operacional:** macOS (Apple Silicon / Intel) ou Linux.
- **Node.js:** Versão 18 ou superior instalada (verifique com `node -v`).
- **Rede:** Computador conectado na mesma rede local Wi-Fi / Ethernet da câmera Besder.

---

## 2. Como Executar a Aplicação

### Método 1: Script de Início Rápido (Recomendado)
No terminal, dentro da pasta do projeto, execute:
```bash
./start.sh
```
O script irá:
1. Iniciar o servidor CamVisul e o engine de streaming em segundo plano.
2. Abrir automaticamente a interface no seu navegador padrão em `http://localhost:3000`.

### Método 2: Pelo Node / NPM
```bash
npm start
```
Em seguida, abra seu navegador em `http://localhost:3000`.

---

## 3. Primeiro Acesso

1. Ao abrir o painel, a tela solicitará o **Login** e a **Senha** da câmera:
   - **IP:** Digite o IP da câmera na sua rede local (ex: `192.168.1.100`).
   - **Usuário:** `admin` (padrão da maioria das câmeras Besder).
   - **Senha:** Digite a senha que você configurou para a câmera no aplicativo móvel ICSee.
2. (Opcional) Marque a caixa **"Lembrar credenciais neste computador"** para não precisar digitar a senha novamente.
3. Clique em **"Conectar à Câmera"**.
4. O stream de vídeo e áudio em tempo real começará instantaneamente!

---

## 4. Controles e Teclas de Atalho

- **Ativar Áudio:** Clique no botão de áudio na barra inferior ou no aviso flutuante para ouvir o som do microfone da câmera.
- **Movimentar a Câmera (PTZ):**
  - Use o controle D-Pad na tela ou as **setas do teclado (↑ ↓ ← →)**.
  - Para zoom: clique nos botões `+` e `-` ou use as teclas `+` e `-` no teclado.
- **Tirar Foto (Snapshot):** Clique no ícone de câmera fotográfica ou pressione a tecla `S`.
- **Tela Cheia:** Clique no ícone de tela cheia ou pressione a tecla `F`.
- **Mudo:** Pressione a tecla `M`.
- **Alternar Qualidade:** Clique no botão `1080p HD` / `SD Fluido` na barra de controles.

---

## 5. Resolução de Problemas Comuns

### 1. "Senha ou usuário incorretos"
- Certifique-se de que a senha digitada é a mesma cadastrada na câmera pelo aplicativo ICSee.
- Se a câmera nunca teve senha definida, experimente deixar o campo em branco ou `admin`.

### 2. "Câmera não responde no IP informado"
- Verifique se a câmera está ligada na tomada e conectada à mesma rede Wi-Fi.
- Você pode testar a conexão no terminal executando: `ping <ip-da-camera>`.

### 3. "Vídeo funcionando, mas sem som"
- O navegador bloqueia áudio por padrão até que o usuário clique em algum botão. Clique no botão de alto-falante na barra de controles ou no aviso flutuante "Clique para ativar áudio" na tela.
