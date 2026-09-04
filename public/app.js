const state = { id: '', name: '', roomId: '', socket: null, localStream: null, previewStream: null, cameraTrack: null, screenTrack: null, screenStream: null, peers: new Map(), iceServers: [], sharing: false };
const $ = (selector) => document.querySelector(selector);
const landing = $('#landing');
const room = $('#room');
const roomIdFromUrl = location.pathname.startsWith('/room/') ? location.pathname.split('/')[2] : '';
const screenProfiles = { '720p30': { width: 1280, height: 720, frameRate: 30, bitrate: 2500000, label: '720p · 30 fps' }, '1080p30': { width: 1920, height: 1080, frameRate: 30, bitrate: 4500000, label: '1080p · 30 fps' }, '1080p60': { width: 1920, height: 1080, frameRate: 60, bitrate: 6500000, label: '1080p · 60 fps' } };

function showNotice(message) { const notice = $('#notice'); notice.textContent = message; notice.classList.remove('hidden'); }
function clearNotice() { $('#notice').classList.add('hidden'); }
function setConnection(label, kind = '') { $('#connection-label').textContent = label; $('#sidebar-connection').textContent = label; $('#connection-dot').className = `status-dot ${kind}`; $('.voice-status .status-dot').className = `status-dot ${kind}`; }
function randomRoom() { return crypto.randomUUID().replaceAll('-', '').slice(0, 8); }
function initials(name) { return (name || '?').trim().slice(0, 1).toUpperCase(); }
function send(message) { if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message)); }
function addMessage(message) { const messages = $('#messages'); messages.querySelector('.empty-chat')?.remove(); const item = document.createElement('article'); item.className = 'message'; const date = new Date(message.at); item.innerHTML = `<div class="message-meta"><span></span><time>${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></div><p></p>`; item.querySelector('span').textContent = message.author; item.querySelector('p').textContent = message.text; messages.append(item); messages.scrollTop = messages.scrollHeight; }

function makeTile(id, name, stream, local = false, participant = {}) {
  const tile = document.createElement('article'); tile.className = `video-tile${local ? ' local' : ''}`; tile.id = `tile-${id}`;
  if (stream) { const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.muted = local; video.srcObject = stream; tile.append(video); }
  else { const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = initials(name); tile.append(avatar); }
  const label = document.createElement('div'); label.className = 'tile-label'; label.textContent = local ? `${name} (você)` : name; tile.append(label);
  const status = document.createElement('div'); status.className = 'tile-status'; tile.append(status); updateTileStatus(tile, participant);
  if (!local) {
    const fullscreen = document.createElement('button'); fullscreen.className = 'media-fullscreen'; fullscreen.type = 'button'; fullscreen.title = 'Abrir transmissão em tela cheia'; fullscreen.setAttribute('aria-label', `Abrir a transmissão de ${name} em tela cheia`); fullscreen.textContent = '⛶'; fullscreen.addEventListener('click', () => toggleFullscreen(tile)); tile.append(fullscreen);
  }
  tile.classList.toggle('screen-share', Boolean(participant.screen));
  $('#video-grid').append(tile); updateParticipantChip(id, name, participant, local); return tile;
}
function updateCount() { const count = $('#video-grid').children.length; $('#participant-count').textContent = `${count} ${count === 1 ? 'pessoa' : 'pessoas'}`; }
function updateTileStatus(tile, participant) { if (!tile) return; tile.querySelector('.tile-status').textContent = `${participant.mic === false ? 'Mic desligado' : 'Mic ativo'}${participant.camera === false ? ' · Câmera desligada' : ''}${participant.screen ? ' · Compartilhando tela' : ''}`; }
function updateTile(id, stream, name) { const tile = $(`#tile-${id}`); if (!tile) return; tile.querySelector('.avatar')?.remove(); if (!tile.querySelector('video')) { const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.srcObject = stream; tile.prepend(video); } else tile.querySelector('video').srcObject = stream; if (name) tile.querySelector('.tile-label').textContent = name; }
function updateParticipantChip(id, name, participant = {}, local = false) { const strip = $('#participants-strip'); let chip = $(`#participant-${id}`); if (!chip) { chip = document.createElement('div'); chip.id = `participant-${id}`; chip.className = 'participant-chip'; chip.innerHTML = '<div class="participant-avatar"></div><div class="participant-details"><strong></strong><small></small></div>'; strip.append(chip); } chip.classList.toggle('local', local); chip.querySelector('.participant-avatar').textContent = initials(name); chip.querySelector('strong').textContent = local ? `${name} (você)` : name; chip.querySelector('small').textContent = participant.mic === false ? 'microfone desligado' : participant.screen ? 'compartilhando tela' : 'conectado'; chip.classList.toggle('muted', participant.mic === false); }
function updatePeerState(participant) { const peer = state.peers.get(participant.id); if (peer) Object.assign(peer, participant); const tile = $(`#tile-${participant.id}`); updateTileStatus(tile, participant); tile?.classList.toggle('screen-share', Boolean(participant.screen)); updateParticipantChip(participant.id, participant.name || peer?.name || 'Convidado', participant); }
async function toggleFullscreen(element) { if (document.fullscreenElement || document.webkitFullscreenElement) { if (document.exitFullscreen) await document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); return; } try { if (element.requestFullscreen) await element.requestFullscreen(); else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen(); else showNotice('Tela cheia não é compatível com este navegador.'); } catch { showNotice('Não foi possível abrir a transmissão em tela cheia.'); } }

async function getMedia() {
  if (!navigator.mediaDevices?.getUserMedia) { showNotice('Seu navegador não suporta chamadas WebRTC.'); return new MediaStream(); }
  try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); }
  catch (error) {
    try { showNotice('Câmera indisponível. A chamada seguirá apenas com áudio.'); return await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
    catch { showNotice('Não foi possível acessar microfone ou câmera. Verifique as permissões do navegador.'); return new MediaStream(); }
  }
}
function createConnection(peerId, peerName, initiator) {
  if (state.peers.has(peerId)) return state.peers.get(peerId);
  const connection = new RTCPeerConnection({ iceServers: state.iceServers });
  const peer = { connection, name: peerName, stream: new MediaStream(), pendingCandidates: [] }; state.peers.set(peerId, peer);
  state.localStream.getTracks().forEach(track => connection.addTrack(track, state.localStream));
  connection.onicecandidate = event => { if (event.candidate) send({ type: 'signal', to: peerId, signal: { candidate: event.candidate } }); };
  connection.ontrack = event => { event.streams[0]?.getTracks().forEach(track => { if (!peer.stream.getTracks().some(existing => existing.id === track.id)) peer.stream.addTrack(track); }); updateTile(peerId, peer.stream, peerName); };
  connection.onconnectionstatechange = () => { if (['failed', 'closed'].includes(connection.connectionState)) removePeer(peerId); };
  makeTile(peerId, peerName, null, false, peer); updateCount();
  if (initiator) connection.createOffer().then(offer => connection.setLocalDescription(offer)).then(() => send({ type: 'signal', to: peerId, signal: { description: connection.localDescription } })).catch(() => showNotice('Não foi possível iniciar a conexão com um participante.'));
  return peer;
}
async function handleSignal(from, signal) {
  const peer = state.peers.get(from); if (!peer) return;
  try {
    if (signal.description) {
      await peer.connection.setRemoteDescription(signal.description);
      for (const candidate of peer.pendingCandidates.splice(0)) await peer.connection.addIceCandidate(candidate);
      if (signal.description.type === 'offer') { const answer = await peer.connection.createAnswer(); await peer.connection.setLocalDescription(answer); send({ type: 'signal', to: from, signal: { description: peer.connection.localDescription } }); }
    } else if (signal.candidate) { if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(signal.candidate); else peer.pendingCandidates.push(signal.candidate); }
  } catch { showNotice('A conexão com um participante foi interrompida.'); }
}
function removePeer(id) { const peer = state.peers.get(id); peer?.connection.close(); state.peers.delete(id); $(`#tile-${id}`)?.remove(); $(`#participant-${id}`)?.remove(); updateCount(); }

async function toggleScreen() {
  if (state.sharing) { stopScreen(); return; }
  if (!navigator.mediaDevices?.getDisplayMedia) { showNotice('Seu navegador não permite compartilhamento de tela.'); return; }
  try {
    const profile = screenProfiles[$('#screen-quality').value] || screenProfiles['1080p60'];
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: profile.width, max: 1920 }, height: { ideal: profile.height, max: 1080 }, frameRate: { ideal: profile.frameRate, max: 60 } }, audio: false });
    state.screenStream = stream; state.screenTrack = stream.getVideoTracks()[0]; await applyScreenQuality(profile); state.sharing = true; $('#screen-preview-video').srcObject = stream; $('#screen-preview').classList.remove('hidden'); $('#screen-quality-label').textContent = profile.label; $('#toggle-screen').classList.add('active'); $('#toggle-screen small').textContent = 'Parar tela';
    state.screenTrack.onended = stopScreen;
    for (const [peerId, peer] of state.peers.entries()) { const sender = peer.screenSender || peer.connection.getSenders().find(item => item.track?.kind === 'video' || item.kind === 'video'); if (sender) { peer.screenSender = sender; await sender.replaceTrack(state.screenTrack); await applySenderQuality(sender, profile); } else { peer.screenSender = peer.connection.addTrack(state.screenTrack, stream); await negotiatePeer(peerId, peer); } }
    send({ type: 'state', screen: true });
  } catch (error) { if (error.name !== 'AbortError') showNotice('Não foi possível iniciar o compartilhamento.'); }
}
async function applySenderQuality(sender, profile) { try { const parameters = sender.getParameters(); parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}]; parameters.encodings[0].maxFramerate = profile.frameRate; parameters.encodings[0].maxBitrate = profile.bitrate; await sender.setParameters(parameters); } catch { /* Alguns navegadores não permitem limitar encodings de tela. */ } }
async function applyScreenQuality(profile) { if (!state.screenTrack) return; try { await state.screenTrack.applyConstraints({ width: { ideal: profile.width, max: 1920 }, height: { ideal: profile.height, max: 1080 }, frameRate: { ideal: profile.frameRate, max: 60 } }); } catch { /* A captura pode usar a resolução escolhida pelo sistema operacional. */ } for (const peer of state.peers.values()) if (peer.screenSender) await applySenderQuality(peer.screenSender, profile); }
async function negotiatePeer(peerId, peer) { const offer = await peer.connection.createOffer(); await peer.connection.setLocalDescription(offer); send({ type: 'signal', to: peerId, signal: { description: peer.connection.localDescription } }); }
async function stopScreen() { if (!state.sharing) return; state.screenTrack?.stop(); state.screenTrack = null; state.screenStream = null; state.sharing = false; $('#screen-preview-video').srcObject = null; $('#screen-preview').classList.add('hidden'); $('#toggle-screen').classList.remove('active'); $('#toggle-screen small').textContent = 'Tela'; const camera = state.cameraTrack || null; for (const peer of state.peers.values()) { const sender = peer.screenSender || peer.connection.getSenders().find(item => item.track?.kind === 'video'); if (sender) await sender.replaceTrack(camera); } send({ type: 'state', screen: false }); }
function toggleTrack(kind, button, label) { const track = kind === 'audio' ? state.localStream?.getAudioTracks()[0] : state.localStream?.getVideoTracks()[0]; if (!track) { showNotice(`Nenhum dispositivo de ${label.toLowerCase()} foi encontrado.`); return; } track.enabled = !track.enabled; button.classList.toggle('active', track.enabled); button.title = `${track.enabled ? 'Desativar' : 'Ativar'} ${label.toLowerCase()}`; const participant = { mic: kind === 'audio' ? track.enabled : state.localStream?.getAudioTracks()[0]?.enabled !== false, camera: kind === 'video' ? track.enabled : state.localStream?.getVideoTracks()[0]?.enabled !== false }; updateParticipantChip('local', state.name, participant, true); send({ type: 'state', [kind === 'audio' ? 'mic' : 'camera']: track.enabled }); }

async function startRoom(name, id, streamOverride) {
  state.name = name; state.roomId = id; history.replaceState({}, '', `/room/${id}`); landing.classList.add('hidden'); room.classList.remove('hidden'); $('#join-gate').classList.add('hidden'); $('#room-name').textContent = id; $('#sidebar-room-name').textContent = id; $('#profile-name').textContent = name; $('#profile-avatar').textContent = initials(name); clearNotice(); setConnection('Conectando...');
  state.localStream = streamOverride || await getMedia(); state.cameraTrack = state.localStream.getVideoTracks()[0] || null; $('#toggle-camera').classList.toggle('active', Boolean(state.cameraTrack)); makeTile('local', state.name, state.localStream, true, { mic: Boolean(state.localStream.getAudioTracks()[0]), camera: Boolean(state.cameraTrack) }); updateCount();
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'; state.socket = new WebSocket(`${protocol}://${location.host}`);
  state.socket.onopen = () => send({ type: 'join', roomId: state.roomId, name: state.name });
  state.socket.onmessage = event => { const message = JSON.parse(event.data); if (message.type === 'welcome') { state.id = message.id; state.iceServers = message.iceServers || []; } if (message.type === 'joined') { setConnection('Conectado', 'online'); send({ type: 'state', mic: Boolean(state.localStream.getAudioTracks()[0]), camera: Boolean(state.cameraTrack) }); message.peers.forEach(peer => createConnection(peer.id, peer.name, true) && updatePeerState(peer)); } if (message.type === 'peer-joined') createConnection(message.peer.id, message.peer.name, false); if (message.type === 'signal') handleSignal(message.from, message.signal); if (message.type === 'peer-state') updatePeerState(message.peer); if (message.type === 'peer-left') removePeer(message.peerId); if (message.type === 'chat') addMessage(message); if (message.type === 'error') { setConnection('Erro', 'error'); showNotice(message.message); } };
  state.socket.onerror = () => { setConnection('Falha', 'error'); showNotice('Falha no signaling. Tente recarregar a sala.'); };
  state.socket.onclose = () => { if (state.socket) setConnection('Desconectado', 'error'); };
}

$('#create-form').addEventListener('submit', event => { event.preventDefault(); const name = $('#display-name').value.trim(); if (name) startRoom(name, randomRoom()); });
$('#join-form').addEventListener('submit', event => { event.preventDefault(); const code = $('#room-code').value.trim().toLowerCase(); const name = $('#display-name').value.trim(); if (!name) { $('#display-name').focus(); showNotice('Informe seu nome antes de entrar.'); return; } if (code) startRoom(name, code); });
$('#toggle-mic').addEventListener('click', () => toggleTrack('audio', $('#toggle-mic'), 'Microfone'));
$('#toggle-camera').addEventListener('click', () => toggleTrack('video', $('#toggle-camera'), 'Câmera'));
$('#toggle-screen').addEventListener('click', toggleScreen);
$('#screen-quality').addEventListener('change', async event => { const profile = screenProfiles[event.target.value]; $('#screen-quality-label').textContent = profile.label; if (state.sharing) await applyScreenQuality(profile); });
$('#screen-preview-fullscreen').addEventListener('click', () => toggleFullscreen($('#screen-preview')));
$('#toggle-chat').addEventListener('click', () => $('#chat-panel').classList.add('open'));
$('#close-chat').addEventListener('click', () => $('#chat-panel').classList.remove('open'));
async function copyInvite(button, original) { try { await navigator.clipboard.writeText(location.href); button.textContent = 'Copiado'; setTimeout(() => { button.textContent = original; }, 1600); } catch { showNotice('Não foi possível copiar o convite.'); } }
$('#copy-link').addEventListener('click', () => copyInvite($('#copy-link'), '⛓'));
$('#sidebar-copy').addEventListener('click', () => copyInvite($('#sidebar-copy'), '＋ convite'));
$('#chat-form').addEventListener('submit', event => { event.preventDefault(); const input = $('#chat-input'); const text = input.value.trim(); if (text) { send({ type: 'chat', text }); input.value = ''; } });
$('#leave').addEventListener('click', () => { send({ type: 'leave' }); state.peers.forEach(peer => peer.connection.close()); state.localStream?.getTracks().forEach(track => track.stop()); location.href = '/'; });
window.addEventListener('beforeunload', () => { send({ type: 'leave' }); state.localStream?.getTracks().forEach(track => track.stop()); });
function togglePreviewTrack(kind, button) { const track = kind === 'audio' ? state.previewStream?.getAudioTracks()[0] : state.previewStream?.getVideoTracks()[0]; if (!track) return; track.enabled = !track.enabled; button.classList.toggle('active', track.enabled); }
$('#preview-mic').addEventListener('click', () => togglePreviewTrack('audio', $('#preview-mic')));
$('#preview-camera').addEventListener('click', () => togglePreviewTrack('video', $('#preview-camera')));
$('#room-entry-form').addEventListener('submit', event => { event.preventDefault(); const name = $('#entry-name').value.trim(); if (!name) return; sessionStorage.setItem('nexa-name', name); const preview = state.previewStream; state.previewStream = null; startRoom(name, roomIdFromUrl, preview); });
async function prepareJoinGate() { landing.classList.add('hidden'); room.classList.remove('hidden'); $('#join-gate').classList.remove('hidden'); $('#entry-name').value = sessionStorage.getItem('nexa-name') || ''; if (!navigator.mediaDevices?.getUserMedia) { $('#preview-camera').disabled = true; $('#preview-mic').disabled = true; return; } try { state.previewStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); } catch { try { state.previewStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); showNotice('Câmera indisponível. Você pode entrar usando apenas áudio.'); } catch { state.previewStream = new MediaStream(); showNotice('Permissões de mídia não concedidas. Você ainda pode entrar na sala.'); } } const video = $('#preview-video'); if (state.previewStream.getVideoTracks().length) video.srcObject = state.previewStream; else { video.classList.add('hidden'); $('#preview-avatar').classList.remove('hidden'); $('#preview-camera').disabled = true; $('#preview-camera').classList.remove('active'); } if (!state.previewStream.getAudioTracks().length) { $('#preview-mic').disabled = true; $('#preview-mic').classList.remove('active'); } }
if (roomIdFromUrl) prepareJoinGate();
$('#display-name').addEventListener('input', event => sessionStorage.setItem('nexa-name', event.target.value));
