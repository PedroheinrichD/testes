import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const rooms = new Map();

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };
const iceServers = (() => {
  try { return JSON.parse(process.env.ICE_SERVERS_JSON || '[{"urls":"stun:stun.l.google.com:19302"}]'); }
  catch { return [{ urls: 'stun:stun.l.google.com:19302' }]; }
})();

function send(socket, message) { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); }
function broadcast(room, message, except) { for (const client of room.values()) if (client !== except) send(client.socket, message); }
function roomFor(socket) { return socket.roomId ? rooms.get(socket.roomId) : null; }
function leave(socket) {
  const room = roomFor(socket);
  if (!room) return;
  room.delete(socket.id);
  broadcast(room, { type: 'peer-left', peerId: socket.id });
  if (!room.size) rooms.delete(socket.roomId);
  socket.roomId = null;
}

function participantInfo(participant) {
  return { id: participant.id, name: participant.name, mic: participant.mic, camera: participant.camera, screen: participant.screen };
}

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (requestPath === '/styles.css' || requestPath === '/app.js') {
    const assetPath = path.join(publicDir, requestPath.slice(1));
    fs.readFile(assetPath, (error, data) => {
      if (error) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Asset not found'); return; }
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(assetPath)], 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      response.end(data);
    });
    return;
  }
  const requestedFile = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.extname(requestedFile) ? path.join(publicDir, requestedFile) : path.join(publicDir, 'index.html');
  if (!filePath.startsWith(publicDir)) { response.writeHead(403); response.end('Forbidden'); return; }
  fs.readFile(filePath, (error, data) => {
    if (error) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(data);
  });
});

const webSocketServer = new WebSocketServer({ server });
webSocketServer.on('connection', (socket) => {
  socket.id = crypto.randomUUID();
  send(socket, { type: 'welcome', id: socket.id, iceServers });
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'join') {
      const roomId = String(message.roomId || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48);
      if (!roomId) return send(socket, { type: 'error', message: 'Sala inválida.' });
      let room = rooms.get(roomId);
      if (!room) { room = new Map(); rooms.set(roomId, room); }
      if (room.size >= 8) return send(socket, { type: 'error', message: 'Esta sala já atingiu o limite de 8 pessoas.' });
      socket.roomId = roomId;
      const participant = { id: socket.id, name: String(message.name || 'Convidado').slice(0, 32), socket, mic: true, camera: true, screen: false };
      const peers = [...room.values()].map(participantInfo);
      room.set(socket.id, participant);
      send(socket, { type: 'joined', roomId, peers });
      broadcast(room, { type: 'peer-joined', peer: participantInfo(participant) }, socket);
      return;
    }
    const room = roomFor(socket);
    if (!room) return;
    if (message.type === 'signal' && room.has(message.to)) {
      send(room.get(message.to).socket, { type: 'signal', from: socket.id, signal: message.signal });
    } else if (message.type === 'state') {
      const participant = room.get(socket.id);
      if (!participant) return;
      if (typeof message.mic === 'boolean') participant.mic = message.mic;
      if (typeof message.camera === 'boolean') participant.camera = message.camera;
      if (typeof message.screen === 'boolean') participant.screen = message.screen;
      broadcast(room, { type: 'peer-state', peer: participantInfo(participant) }, socket);
    } else if (message.type === 'chat') {
      const author = room.get(socket.id)?.name || 'Convidado';
      broadcast(room, { type: 'chat', id: crypto.randomUUID(), author, text: String(message.text || '').slice(0, 1000), at: new Date().toISOString() });
    } else if (message.type === 'leave') leave(socket);
  });
  socket.on('close', () => leave(socket));
});

server.listen(port, () => console.log(`Nexa running on port ${port}`));
