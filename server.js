// backend/server.js
import express from 'express';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'path';

const app = express();
app.use(express.json());

// CORS biar Netlify bisa akses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

let sock = null;
let isReady = false;

// Endpoint cek status
app.get('/', (req, res) => {
  res.json({ status: isReady ? 'connected' : 'disconnected' });
});

// Endpoint reaction
app.post('/react', async (req, res) => {
  const { channelId, serverId, emoji } = req.body;

  if (!isReady || !sock) return res.status(503).json({ error: 'WhatsApp belum terhubung / belum scan QR' });
  if (!channelId || !serverId || !emoji) return res.status(400).json({ error: 'Data tidak lengkap' });

  try {
    const jid = `${channelId}@newsletter`;
    await sock.newsletterReactMessage(jid, serverId, emoji);
    res.json({ success: true, message: `Reaction ${emoji} terkirim` });
  } catch (err) {
    console.error('React error:', err);
    res.status(500).json({ error: err.message || 'Gagal' });
  }
});

// Start Baileys
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(process.cwd(), 'session')
  );
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      console.log('\n📱 Scan QR:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      isReady = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) startSock();
    }

    if (connection === 'open') {
      isReady = true;
      console.log('✅ WhatsApp terhubung!');
    }
  });
}

startSock();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend jalan di port ${PORT}`));