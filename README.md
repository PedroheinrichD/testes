# Nexa

Nexa e uma sala privada de chamadas entre amigos. O audio, video e compartilhamento de tela usam WebRTC diretamente entre os navegadores; o servidor so mantem as salas em memoria e encaminha signaling e chat enquanto a sala esta ativa.

## Executar

Requisitos: Node.js 18+.

```bash
npm install
npm start
```

Abra `http://localhost:3000` em duas janelas ou dispositivos. Em producao, use HTTPS: os navegadores exigem uma origem segura para camera, microfone e tela.

## Deploy

O servidor e compativel com plataformas Node que mantenham WebSocket, como Render, Railway ou Fly.io. O arquivo `render.yaml` ja define o build e o comando de inicio para o Render.

No Render:

1. Crie um Web Service apontando para este repositorio, ou use o Blueprint `render.yaml`.
2. Defina `ICE_SERVERS_JSON` nas variaveis do servico.
3. Publique e use a URL HTTPS gerada pelo Render. O WebSocket usa `wss://` automaticamente quando a pagina esta em HTTPS.

Para uma primeira publicacao, o STUN abaixo e suficiente para muitos casos:

```json
[{"urls":"stun:stun.l.google.com:19302"}]
```

Para funcionar em redes moveis, corporativas ou com NAT restritivo, configure tambem um TURN gerenciado. Nunca coloque usuario ou credencial TURN no frontend ou no Git.

`ICE_SERVERS_JSON` aceita uma lista JSON de servidores STUN/TURN. O exemplo usa STUN publico. Para redes restritivas, configure um TURN gerenciado e informe suas credenciais somente nas variaveis do ambiente do servidor. Nenhuma midia e armazenada.

## Limites atuais

As salas sao efemeras e vivem no processo do servidor. Reiniciar o servico encerra as salas ativas. O limite e de oito participantes por sala.