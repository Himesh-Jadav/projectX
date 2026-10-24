import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const dateLabel = (value) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Recently';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};
const idOf = (memory) => String(memory?._id ?? '');
const typeLabel = (type) => ({ decision: 'Decision', assumption: 'Assumption', constraint: 'Constraint', outcome: 'Outcome' }[type] || type || 'Memory');
const responseText = (value) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    for (const key of ['reply', 'text', 'content', 'message']) {
      if (typeof value[key] === 'string') return value[key];
    }
    return JSON.stringify(value, null, 2);
  }
  return value == null ? '' : String(value);
};

function renderInline(text, prefix) {
  const pieces = text.split(/(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+`|\*[^*\n]+?\*|_[^_\n]+?_)/g);
  return pieces.map((piece, index) => {
    const key = `${prefix}-${index}`;
    if ((piece.startsWith('**') && piece.endsWith('**')) || (piece.startsWith('__') && piece.endsWith('__'))) {
      return <strong key={key}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith('`') && piece.endsWith('`')) return <code key={key}>{piece.slice(1, -1)}</code>;
    if ((piece.startsWith('*') && piece.endsWith('*')) || (piece.startsWith('_') && piece.endsWith('_'))) {
      return <em key={key}>{piece.slice(1, -1)}</em>;
    }
    return piece;
  });
}

function AssistantText({ text }) {
  const lines = responseText(text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listType = '';
  let codeLines = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length) blocks.push({ type: listType, items: listItems });
    listItems = [];
    listType = '';
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushList();
      if (codeLines) {
        blocks.push({ type: 'code', text: codeLines.join('\n') });
        codeLines = null;
      } else codeLines = [];
      continue;
    }
    if (codeLines) { codeLines.push(line); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }

    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ type: `heading${heading[1].length}`, text: heading[2] });
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = ordered ? 'ordered' : 'unordered';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push(ordered ? ordered[1] : unordered[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (codeLines) blocks.push({ type: 'code', text: codeLines.join('\n') });

  return <div className="assistant-copy-content">
    {blocks.map((block, index) => {
      if (block.type === 'unordered' || block.type === 'ordered') {
        const Tag = block.type === 'ordered' ? 'ol' : 'ul';
        return <Tag key={`list-${index}`}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `list-${index}-${itemIndex}`)}</li>)}</Tag>;
      }
      if (block.type === 'code') return <pre key={`code-${index}`}><code>{block.text}</code></pre>;
      if (block.type.startsWith('heading')) {
        const Tag = block.type === 'heading1' ? 'h2' : 'h3';
        return <Tag key={`heading-${index}`}>{renderInline(block.text, `heading-${index}`)}</Tag>;
      }
      return <p key={`paragraph-${index}`}>{renderInline(block.text, `paragraph-${index}`)}</p>;
    })}
  </div>;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function Icon({ name, size = 16 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    down: <><path d="m7 10 5 5 5-5" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8M8 11h8" /></>,
    quote: <><path d="M10 11H5V6h5v5Zm9 0h-5V6h5v5ZM5 11c0 4 1.5 6 4 7m5-7c0 4 1.5 6 4 7" /></>
  };
  return <svg {...common}>{paths[name] || paths.spark}</svg>;
}

function MemoryCard({ memory, used, score, why, selected, onSelect, onDelete, onInvalidate, onResolve, onConfirm, compact = false }) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const percent = Math.max(0, Math.min(100, Math.round((score ?? 0) * 100)));
  return <article className={`memory-card ${selected ? 'is-selected' : ''} ${compact ? 'compact' : ''}`} onClick={() => onSelect?.(memory)}>
    <div className="memory-meta">
      <span className={`type-pill type-${memory.type}`}>{typeLabel(memory.type)}</span>
      <span className={`status-dot status-${memory.status}`}>{memory.status || 'active'}</span>
      <span className="memory-date">{dateLabel(memory.createdAt)}</span>
    </div>
    <h3>{memory.content}</h3>
    {memory.reason && <p className="memory-reason">{memory.reason}</p>}
    {used && <div className="score-block">
      <div className="score-label"><span>Match strength</span><strong>{percent}%</strong></div>
      <div className="score-track"><span style={{ width: `${percent}%` }} /></div>
      <p className="why-line"><span>Why this appeared</span>{why || 'Relevant to the current conversation.'}</p>
    </div>}
    {memory.source?.quote && <div className="source-wrap">
      <button className="text-button source-toggle" onClick={(event) => { event.stopPropagation(); setQuoteOpen((value) => !value); }} aria-expanded={quoteOpen}>
        <Icon name="quote" size={14} /> {quoteOpen ? 'Hide source quote' : 'View source quote'} <Icon name="down" size={13} />
      </button>
      {quoteOpen && <blockquote>“{memory.source.quote}”</blockquote>}
    </div>}
    {!compact && <div className="memory-actions" onClick={(event) => event.stopPropagation()}>
      {memory.status === 'pending' ? <>
        <button className="button button-primary button-small" onClick={() => onResolve?.(memory, 'override')}>Override</button>
        <button className="button button-quiet button-small" onClick={() => onResolve?.(memory, 'keep')}>Keep current</button>
      </> : <>
        {memory.status === 'active' && <button className="button button-quiet button-small" onClick={() => onInvalidate?.(memory)}><Icon name="close" size={14} /> Invalidate</button>}
        <button className="icon-button danger-hover" title="Delete memory" aria-label="Delete memory" onClick={() => onDelete?.(memory)}><Icon name="trash" /></button>
      </>}
    </div>}
  </article>;
}

function ConflictCard({ conflict, onResolve, busy }) {
  const pending = conflict.pending;
  const target = conflict.target;
  return <section className="conflict-card">
    <div className="conflict-heading"><span className="conflict-icon">↔</span><div><strong>A decision is in conflict</strong><p>Keep what you decided, or replace it with this update.</p></div></div>
    <div className="conflict-compare">
      <div><span className="compare-label">CURRENT</span><p>{target?.content || 'Existing project memory'}</p>{target?.reason && <small>{target.reason}</small>}</div>
      <div><span className="compare-label">NEW</span><p>{pending?.content}</p>{pending?.reason && <small>{pending.reason}</small>}</div>
    </div>
    <div className="conflict-actions">
      <button className="button button-primary button-small" disabled={busy} onClick={() => onResolve(pending, 'override')}>Override decision</button>
      <button className="button button-quiet button-small" disabled={busy} onClick={() => onResolve(pending, 'keep')}>Keep current</button>
    </div>
  </section>;
}

function App() {
  const [sessionId, setSessionId] = useState(() => `s_${crypto.randomUUID()}`);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [tab, setTab] = useState('used');
  const [lastUsed, setLastUsed] = useState([]);
  const [allMemories, setAllMemories] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const inputRef = useRef(null);
  const feedRef = useRef(null);
  const toastTimer = useRef(null);
  const startedRef = useRef(false);

  const notify = useCallback((message, kind = 'success') => {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const refreshMemories = useCallback(async () => {
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const result = await api(`/api/memories${params.size ? `?${params}` : ''}`);
    setAllMemories(result.memories || []);
  }, [typeFilter, statusFilter]);

  const startSession = useCallback(async (fresh = false) => {
    const nextId = `s_${crypto.randomUUID()}`;
    setSessionId(nextId);
    setMessages([]);
    setLastUsed([]);
    setCheckIns([]);
    setSelectedId('');
    setTab('used');
    if (fresh) notify('A fresh session is ready.', 'neutral');
    try {
      const result = await api(`/api/session/start?sessionId=${encodeURIComponent(nextId)}`);
      setCheckIns(result.checkIns || []);
      setPageError('');
    } catch (error) {
      setPageError(error.message);
    }
  }, [notify]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startSession(false);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => { refreshMemories().catch(() => {}); }, [refreshMemories]);

  const sendMessage = async (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setPageError('');
    setMessages((items) => [...items, { role: 'user', text, localId: crypto.randomUUID() }]);
    setBusy(true);
    try {
      const result = await api('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, message: text, memoryEnabled }) });
      setMessages((items) => [...items, { role: 'assistant', text: responseText(result.reply), used: result.used || [], changes: result.changes || [], conflicts: result.conflicts || [], notices: result.notices || [], localId: crypto.randomUUID() }]);
      setLastUsed(result.used || []);
      const savedCount = (result.changes || []).filter((change) => change.kind === 'created').length;
      const secretNotice = (result.notices || []).find((notice) => notice.toLowerCase().includes('not saved: looks like a secret'));
      if (secretNotice) notify('Not saved: looks like a secret', 'warning');
      else if (savedCount) notify(`${savedCount} ${savedCount === 1 ? 'memory' : 'memories'} saved`);
      else if ((result.conflicts || []).length) notify('Conflict held for your review.', 'neutral');
      else if ((result.notices || []).length) notify(result.notices[0], 'warning');
      await refreshMemories().catch(() => {});
    } catch (error) {
      setMessages((items) => [...items, { role: 'assistant', text: 'I could not send that just now. Please try again.', localId: crypto.randomUUID(), failed: true }]);
      notify(error.message, 'warning');
    } finally { setBusy(false); }
  };

  const resolveConflict = async (memory, action) => {
    if (!memory?._id) return;
    setBusy(true);
    try {
      await api(`/api/memories/${idOf(memory)}/resolve`, { method: 'POST', body: JSON.stringify({ action }) });
      setMessages((items) => items.map((message) => ({ ...message, conflicts: (message.conflicts || []).filter(({ pending }) => idOf(pending) !== idOf(memory)) })));
      notify(action === 'override' ? 'Decision updated. The previous choice is in the timeline.' : 'Kept the current decision.');
      await refreshMemories();
      if (tab === 'timeline') loadTimeline();
    } catch (error) { notify(error.message, 'warning'); }
    finally { setBusy(false); }
  };

  const mutateMemory = async (memory, action) => {
    if (!memory?._id) return;
    try {
      if (action === 'delete') await api(`/api/memories/${idOf(memory)}`, { method: 'DELETE' });
      if (action === 'invalidate') await api(`/api/memories/${idOf(memory)}/invalidate`, { method: 'POST', body: JSON.stringify({ reason: 'Marked no longer true from the memory panel.' }) });
      if (action === 'confirm') await api(`/api/memories/${idOf(memory)}/confirm`, { method: 'POST', body: JSON.stringify({}) });
      setCheckIns((items) => items.filter((item) => idOf(item.memory) !== idOf(memory)));
      notify(action === 'delete' ? 'Memory permanently deleted.' : action === 'confirm' ? 'Assumption confirmed.' : 'Memory invalidated.');
      await refreshMemories();
    } catch (error) { notify(error.message, 'warning'); }
  };

  const loadTimeline = async () => {
    setTimelineLoading(true);
    try {
      const response = await api('/api/memories?status=superseded');
      const old = response.memories || [];
      const chains = await Promise.all(old.map(async (memory) => {
        try { return (await api(`/api/memories/${idOf(memory)}/chain`)).chain || [memory]; }
        catch { return [memory]; }
      }));
      const unique = new Map();
      chains.flat().forEach((memory) => unique.set(idOf(memory), memory));
      setTimeline([...unique.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
    } catch (error) { notify(error.message, 'warning'); }
    finally { setTimelineLoading(false); }
  };

  const selectTab = (next) => {
    setTab(next);
    if (next === 'timeline') loadTimeline();
    if (next === 'all') refreshMemories().catch((error) => notify(error.message, 'warning'));
  };
  const showMemory = (memory) => {
    setSelectedId(idOf(memory));
    setTab('used');
    setMobilePanel(true);
  };
  const selectedMemory = useMemo(() => allMemories.find((memory) => idOf(memory) === selectedId), [allMemories, selectedId]);
  const usedIds = new Set(lastUsed.map(({ memory }) => idOf(memory)));

  const renderCheckIn = (item) => <div className="checkin" key={idOf(item.memory)}>
    <span className="checkin-icon"><Icon name={item.kind === 'assumption_due' ? 'spark' : 'clock'} size={16} /></span>
    <div className="checkin-copy"><span>{item.kind === 'assumption_due' ? 'ASSUMPTION TO REVIEW' : 'EXPIRING SOON'}</span><p>{item.memory.content}</p><small>{item.kind === 'assumption_due' ? `Due ${dateLabel(item.memory.revisitAfter)}` : `Expires ${dateLabel(item.memory.expiresAt)}`}</small></div>
    <div className="checkin-actions"><button className="button button-quiet button-small" onClick={() => mutateMemory(item.memory, 'invalidate')}>No longer true</button><button className="icon-button" aria-label="Confirm memory" title="Confirm" onClick={() => mutateMemory(item.memory, 'confirm')}><Icon name="check" /></button></div>
  </div>;

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Hindsight home"><span className="brand-mark"><Icon name="spark" size={18} /></span><span>hindsight</span></a>
      <div className="project-indicator"><span className="project-avatar">Q</span><div><small>YOUR PROJECT</small><strong>QuickBite</strong></div><span className="project-chevron">⌄</span></div>
      <div className="topbar-actions">
        <label className={`memory-toggle ${memoryEnabled ? 'enabled' : ''}`} title="Memory on or off"><span>Memory</span><input type="checkbox" checked={memoryEnabled} onChange={(event) => setMemoryEnabled(event.target.checked)} /><span className="toggle-track"><i /></span><b>{memoryEnabled ? 'On' : 'Off'}</b></label>
        <button className="button button-new" onClick={() => startSession(true)}><Icon name="plus" size={15} /><span>New session</span></button>
      </div>
    </header>

    <main className="workspace">
      <section className={`chat-column ${mobilePanel ? 'mobile-hidden' : ''}`} aria-label="Project chat">
        <div className="chat-heading"><div><p className="eyebrow">PROJECT CONVERSATION</p><h1>What are we working on?</h1><p className="heading-subtitle">A thinking partner that remembers the why.</p></div><button className="mobile-panel-button" onClick={() => setMobilePanel(true)}><Icon name="book" /> Memories</button></div>
        {checkIns.length > 0 && <section className="checkins-section"><div className="section-kicker"><span className="pulse-dot" /> A few things to revisit <span className="checkin-count">{checkIns.length}</span></div>{checkIns.map(renderCheckIn)}</section>}
        {pageError && <div className="inline-error"><span>{pageError}</span><button className="text-button" onClick={() => startSession(false)}>Retry</button></div>}
        <div className={`chat-feed ${messages.length ? 'has-messages' : ''}`} ref={feedRef}>
          {messages.length === 0 && <div className="welcome-block"><div className="welcome-symbol"><Icon name="spark" size={24} /></div><span className="eyebrow">A FRESH PERSPECTIVE, WITH CONTEXT</span><h2>Good ideas deserve<br />to be remembered.</h2><p>Share a decision, a constraint, or what you're figuring out. Hindsight will keep the important parts close.</p><div className="suggestion-row"><button onClick={() => setDraft("We're using MongoDB for orders because the menu shapes are flexible and we need to ship quickly.")}>Share a decision <Icon name="arrow" size={13} /></button><button onClick={() => setDraft("Most of our customers will be ordering from their phones.")}>Add an assumption <Icon name="arrow" size={13} /></button></div></div>}
          {messages.map((message) => <div className={`message-row ${message.role}`} key={message.localId}>
            {message.role === 'assistant' && <span className="assistant-avatar"><Icon name="spark" size={15} /></span>}
            <div className="message-content">
              {message.role === 'user' ? <div className="user-bubble">{message.text}</div> : <>
                <div className={`assistant-copy ${message.failed ? 'failed-copy' : ''}`}><AssistantText text={message.text} /></div>
                {!!message.used?.length && <div className="memory-chips"><span>Remembered</span>{message.used.map(({ memory }) => <button key={idOf(memory)} className="memory-chip" onClick={() => showMemory(memory)} title={memory.content}><span className="chip-mark">↗</span>{memory.content}</button>)}</div>}
                {!!message.changes?.filter((change) => change.kind === 'created').length && <div className="saved-inline"><span className="saved-check"><Icon name="check" size={12} /></span>{message.changes.filter((change) => change.kind === 'created').length} new {message.changes.filter((change) => change.kind === 'created').length === 1 ? 'memory' : 'memories'} saved</div>}
                {(message.notices || []).filter((notice) => !notice.toLowerCase().includes('not saved: looks like a secret')).map((notice, i) => <div className="message-notice" key={i}>{notice}</div>)}
                {!!message.conflicts?.length && <div className="conflict-stack">{message.conflicts.map((conflict) => <ConflictCard key={idOf(conflict.pending)} conflict={conflict} onResolve={resolveConflict} busy={busy} />)}</div>}
              </>}
            </div>
          </div>)}
          {busy && <div className="message-row assistant"><span className="assistant-avatar"><Icon name="spark" size={15} /></span><div className="thinking"><i /><i /><i /><span>Thinking with context</span></div></div>}
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="Tell me what you're thinking..." rows={1} aria-label="Message Hindsight" />
          <div className="composer-footer"><span><span className="composer-status" />{memoryEnabled ? 'Memory is on for this project' : 'Memory is off for this message'}</span><button className="send-button" disabled={!draft.trim() || busy} aria-label="Send message" type="submit"><Icon name="arrow" size={17} /></button></div>
        </form>
        <p className="privacy-note"><Icon name="book" size={12} /> Your project context stays yours.</p>
      </section>

      <aside className={`memory-panel ${mobilePanel ? 'mobile-visible' : ''}`} aria-label="Project memory">
        <div className="panel-topline"><div><p className="eyebrow">PROJECT CONTEXT</p><h2>Memory</h2></div><div className="memory-count"><strong>{allMemories.length}</strong><span>memories</span></div><button className="panel-close mobile-panel-button" aria-label="Close memory panel" onClick={() => setMobilePanel(false)}><Icon name="close" /></button></div>
        <div className="panel-tabs" role="tablist" aria-label="Memory views">
          <button role="tab" aria-selected={tab === 'used'} className={tab === 'used' ? 'active' : ''} onClick={() => selectTab('used')}>Used in this reply</button>
          <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => selectTab('all')}>All memories</button>
          <button role="tab" aria-selected={tab === 'timeline'} className={tab === 'timeline' ? 'active' : ''} onClick={() => selectTab('timeline')}>Timeline</button>
        </div>
        <div className="panel-body">
          {tab === 'used' && <>
            {lastUsed.length ? <><div className="panel-intro"><span className="panel-live-dot" />These memories shaped the latest reply.</div>{lastUsed.map((entry) => <MemoryCard key={idOf(entry.memory)} memory={entry.memory} used score={entry.finalScore ?? entry.similarity} why={entry.why} selected={selectedId === idOf(entry.memory)} onSelect={showMemory} onInvalidate={(memory) => mutateMemory(memory, 'invalidate')} onDelete={(memory) => mutateMemory(memory, 'delete')} />)}</> : <div className="panel-empty"><span className="empty-illustration"><Icon name="spark" size={21} /></span><h3>No memories used yet</h3><p>When a project memory helps with a reply, you’ll see it here with its match score and source.</p><button className="text-button" onClick={() => selectTab('all')}>Browse all memories <Icon name="arrow" size={13} /></button></div>}
            {selectedMemory && <div className="selected-note"><span className="selected-check"><Icon name="check" size={12} /></span>Selected from chat</div>}
          </>}
          {tab === 'all' && <>
            <div className="filter-row"><label><span className="sr-only">Filter by type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="decision">Decisions</option><option value="assumption">Assumptions</option><option value="constraint">Constraints</option><option value="outcome">Outcomes</option></select></label><label><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="superseded">Superseded</option><option value="invalid">Invalid</option></select></label></div>
            {allMemories.length ? allMemories.map((memory) => <MemoryCard key={idOf(memory)} memory={memory} selected={selectedId === idOf(memory)} onSelect={showMemory} onResolve={resolveConflict} onInvalidate={(item) => mutateMemory(item, 'invalidate')} onDelete={(item) => mutateMemory(item, 'delete')} />) : <div className="panel-empty small-empty"><span className="empty-illustration"><Icon name="book" size={20} /></span><h3>Nothing here yet</h3><p>Decisions and useful context will appear here as you talk.</p></div>}
          </>}
          {tab === 'timeline' && <>
            <div className="panel-intro"><Icon name="clock" size={15} /> Follow how project decisions have changed.</div>
            {timelineLoading ? <div className="timeline-loading"><i /> Loading history…</div> : timeline.length ? <div className="timeline-list">{timeline.map((memory, index) => <div className="timeline-entry" key={idOf(memory)}><div className="timeline-rail"><span className={memory.status === 'active' ? 'rail-current' : ''} />{index < timeline.length - 1 && <i />}</div><div className="timeline-card"><div className="memory-meta"><span className={`type-pill type-${memory.type}`}>{typeLabel(memory.type)}</span><span className="memory-date">{dateLabel(memory.createdAt)}</span></div><h3>{memory.content}</h3>{memory.reason && <p className="memory-reason">{memory.reason}</p>}<span className={`timeline-status status-${memory.status}`}>{memory.status === 'active' ? 'Current decision' : memory.status}</span></div></div>)}</div> : <div className="panel-empty small-empty"><span className="empty-illustration"><Icon name="clock" size={20} /></span><h3>No changes to trace</h3><p>When a decision is updated, its history will appear here.</p></div>}
          </>}
        </div>
        <div className="panel-footer"><span className="footer-lock">⌑</span><span>Project memory · QuickBite</span><span className="footer-sync"><i /> Synced</span></div>
      </aside>
    </main>
    {toast && <div className={`toast toast-${toast.kind}`} role="status"><span className="toast-icon"><Icon name={toast.kind === 'warning' ? 'close' : 'check'} size={15} /></span>{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={14} /></button></div>}
  </div>;
}

export default App;
