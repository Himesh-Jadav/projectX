import { connect, memories, memory_events } from '../db.js';

const clientsByProject = new Map();
const RESTART_BACKOFF_MS = 1_000;
const HEARTBEAT_MS = 25_000;
let watcherStarted = false;
let expiryWatcherStarted = false;
let expiryCheckRunning = false;

function writeEvent(response, event, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function summaryFor(kind) {
  const summaries = {
    created: 'A memory was saved.',
    conflict_held: 'A memory is waiting for review.',
    confirmed: 'A memory was confirmed.',
    superseded: 'A memory was updated.',
    invalidated: 'A memory was marked no longer true.',
    deleted: 'A memory was deleted.',
    expired: 'A memory expired.',
    conflict_stale: 'A pending memory is no longer current.',
    conflict_withdrawn: 'A pending memory was withdrawn.'
  };
  return summaries[kind] ?? 'Project memory changed.';
}

function payloadFrom(change) {
  const document = change.fullDocument;
  if (change.ns?.coll === 'memories') {
    // A delete has no fullDocument. Its memory_events insert announces it safely.
    if (change.operationType === 'delete' || !document?.projectId) return null;
    const kind = change.operationType === 'insert'
      ? (document.status === 'pending' ? 'conflict_held' : 'created')
      : (document.status === 'invalid' ? 'invalidated' : document.status === 'superseded' ? 'superseded' : 'updated');
    return {
      projectId: String(document.projectId),
      event: 'memory',
      payload: {
        kind,
        memoryId: String(document._id),
        memoryType: document.type ?? '',
        actorName: document.createdByName ?? '',
        summary: summaryFor(kind),
        at: document.updatedAt ?? document.createdAt ?? change.wallTime ?? new Date()
      }
    };
  }

  if (change.ns?.coll !== 'memory_events' || change.operationType !== 'insert' || !document?.projectId) return null;
  const kind = String(document.event ?? 'updated');
  return {
    projectId: String(document.projectId),
    event: 'memory',
    payload: {
      kind,
      memoryId: document.memoryId ? String(document.memoryId) : '',
        memoryType: '',
      actorName: document.actorName ?? '',
      summary: summaryFor(kind),
      at: document.at ?? change.wallTime ?? new Date()
    }
  };
}

function fanOut(change) {
  const mapped = payloadFrom(change);
  if (!mapped) return;
  const clients = clientsByProject.get(mapped.projectId);
  if (!clients) return;
  for (const response of clients) writeEvent(response, mapped.event, mapped.payload);
}

async function runWatcher() {
  let stream;
  try {
    const database = await connect();
    stream = database.watch([
      { $match: { 'ns.coll': { $in: ['memories', 'memory_events'] } } }
    ], { fullDocument: 'updateLookup' });
    for await (const change of stream) fanOut(change);
    throw new Error('MongoDB change stream closed unexpectedly.');
  } catch (error) {
    console.error(`Realtime change stream failed; restarting in ${RESTART_BACKOFF_MS}ms: ${error.message}`);
  } finally {
    await stream?.close().catch(() => {});
    setTimeout(() => { void runWatcher(); }, RESTART_BACKOFF_MS).unref?.();
  }
}

export function startRealtime() {
  if (watcherStarted) return;
  watcherStarted = true;
  void runWatcher();
  if (!expiryWatcherStarted) {
    expiryWatcherStarted = true;
    const timer = setInterval(() => { void announceExpiredMemories(); }, 5_000);
    timer.unref?.();
  }
}

async function announceExpiredMemories() {
  if (expiryCheckRunning) return;
  expiryCheckRunning = true;
  try {
    await connect();
    const expired = await memories.find({ expiresAt: { $lte: new Date() } }, {
      projection: { _id: 1, projectId: 1, userId: 1, createdByName: 1, expiresAt: 1 }
    }).limit(100).toArray();
    for (const memory of expired) {
      // Emit the content-free audit event before deleting the document. The TTL index
      // remains a safety net while the server is down.
      await memory_events.insertOne({
        projectId: String(memory.projectId),
        memoryId: memory._id,
        actorId: String(memory.userId ?? ''),
        actorName: memory.createdByName ?? '',
        event: 'expired',
        at: memory.expiresAt ?? new Date(),
        details: {}
      });
      await memories.deleteOne({ _id: memory._id, projectId: memory.projectId, expiresAt: { $lte: new Date() } });
    }
  } catch (error) {
    console.error(`Memory expiry check failed: ${error.message}`);
  } finally {
    expiryCheckRunning = false;
  }
}

export function attachProjectStream(req, res) {
  const projectId = String(req.params.projectId);
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  writeEvent(res, 'hello', { kind: 'hello', memoryId: '', actorName: '', summary: 'Connected to project updates.', at: new Date() });

  let clients = clientsByProject.get(projectId);
  if (!clients) clientsByProject.set(projectId, clients = new Set());
  clients.add(res);
  const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, HEARTBEAT_MS);
  heartbeat.unref?.();
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (!clients.size) clientsByProject.delete(projectId);
  });
}
