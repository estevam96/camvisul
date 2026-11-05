# Controle de Movimentação e Zoom (PTZ - Pan/Tilt/Zoom)

## 1. Identificação do Suporte na Câmera

A câmera Besder possui suporte integral à especificação **ONVIF 16.12 PTZ Service** na porta `8899`, como confirmado pelo descritor de perfil `PROFILE_000`:

```xml
<tt:PTZConfiguration token="PTZConfigurationToken">
  <tt:NodeToken>NODE_000</tt:NodeToken>
  <tt:PanTiltLimits>
    <tt:Range>
      <tt:XRange><tt:Min>-1.0</tt:Min><tt:Max>1.0</tt:Max></tt:XRange>
      <tt:YRange><tt:Min>-1.0</tt:Min><tt:Max>1.0</tt:Max></tt:YRange>
    </tt:Range>
  </tt:PanTiltLimits>
</tt:PTZConfiguration>
```

---

## 2. Protocolo de Comunicação ONVIF SOAP

O backend CamVisul interage com o endpoint `http://<camera-ip>:8899/onvif/ptz_service` enviando envelopes SOAP com cabeçalhos de segurança WS-Security UsernameToken (quando configurado) ou chamadas diretas.

### 2.1. Movimento Contínuo (`ContinuousMove`)

Quando o usuário pressiona um botão direcional no D-Pad (ou mantém pressionada uma seta do teclado):

```xml
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <tptz:ContinuousMove>
      <tptz:ProfileToken>PROFILE_000</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="0.5" y="0.0" space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace"/>
      </tptz:Velocity>
    </tptz:ContinuousMove>
  </s:Body>
</s:Envelope>
```

- **Pan para a Direita:** `x = 0.5`, `y = 0.0`
- **Pan para a Esquerda:** `x = -0.5`, `y = 0.0`
- **Tilt para Cima:** `x = 0.0`, `y = 0.5`
- **Tilt para Baixo:** `x = 0.0`, `y = -0.5`
- **Zoom In:** `zoom x = 0.5`
- **Zoom Out:** `zoom x = -0.5`

### 2.2. Parada (`Stop`)

Assim que o usuário solta o botão do mouse ou a tecla:

```xml
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <s:Body>
    <tptz:Stop>
      <tptz:ProfileToken>PROFILE_000</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>
  </s:Body>
</s:Envelope>
```

A câmera interrompe imediatamente o motor com tempo de resposta imperceptível.

---

## 3. Controles no Teclado (Atalhos)

Para maior conforto durante a visualização pelo computador, os seguintes atalhos de teclado estão integrados:

| Tecla | Ação |
|---|---|
| `Seta para Cima (↑)` | Movimenta a câmera para cima |
| `Seta para Baixo (↓)` | Movimenta a câmera para baixo |
| `Seta para Esquerda (←)` | Gira a câmera para a esquerda |
| `Seta para Direita (→)` | Gira a câmera para a direita |
| `Tecla +` ou `=` | Zoom In |
| `Tecla -` | Zoom Out |
| `Tecla M` | Muta / Desmuta o áudio |
| `Tecla F` | Alterna modo Tela Cheia (Fullscreen) |
| `Tecla S` | Tira um Snapshot fotográfico |
