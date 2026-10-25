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

function tableCells(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  while (cells.length && !cells[0]) cells.shift();
  while (cells.length && !cells[cells.length - 1]) cells.pop();
  return cells;
}

function isTableDivider(line) {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderTableCell(text, prefix) {
  return text.split(/<br\s*\/?\s*>/i).flatMap((part, index) => index
    ? [<br key={`${prefix}-br-${index}`} />, ...renderInline(part, `${prefix}-${index}`)]
    : renderInline(part, `${prefix}-${index}`));
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

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
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

    if (line.includes('|') && lines[lineIndex + 1]?.includes('|') && isTableDivider(lines[lineIndex + 1])) {
      flushParagraph();
      flushList();
      const headers = tableCells(line);
      const rows = [];
      lineIndex += 2;
      while (lineIndex < lines.length && lines[lineIndex].includes('|') && lines[lineIndex].trim()) {
        rows.push(tableCells(lines[lineIndex]));
        lineIndex += 1;
      }
      lineIndex -= 1;
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

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
      if (block.type === 'table') return <div className="assistant-table-wrap" key={`table-${index}`}><table className="assistant-table"><thead><tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{renderTableCell(cell, `table-${index}-head-${cellIndex}`)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, cellIndex) => <td key={cellIndex}>{renderTableCell(row[cellIndex] || '', `table-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>;
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
    credentials: 'include',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function useProjectStream(projectId, onEvent) {
  useEffect(() => {
    if (!projectId || !onEvent) return undefined;
    let polling = false;
    let timer;
    const stream = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/stream`, { withCredentials: true });
    stream.addEventListener('memory', (event) => {
      let payload = {};
      try { payload = JSON.parse(event.data); } catch { /* Ignore malformed events. */ }
      onEvent(payload);
    });
    stream.onerror = () => {
      if (polling) return;
      polling = true;
      stream.close();
      timer = setInterval(() => onEvent(null), 3000);
    };
    return () => { stream.close(); clearInterval(timer); };
  }, [projectId, onEvent]);
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

function MemoryCard({ memory, used, score, why, selected, onSelect, onDelete, onInvalidate, onResolve, onWithdraw, onConfirm, mayChange = true, compact = false }) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const percent = Math.max(0, Math.min(100, Math.round((score ?? 0) * 100)));
  return <article className={`memory-card ${selected ? 'is-selected' : ''} ${compact ? 'compact' : ''}`} onClick={() => onSelect?.(memory)}>
    <div className="memory-meta">
      <span className={`type-pill type-${memory.type}`}>{typeLabel(memory.type)}</span>
      <span className={`status-dot status-${memory.status}`}>{memory.status || 'active'}</span>
      <span className="memory-date">{dateLabel(memory.createdAt)}</span>
    </div>
    <h3>{memory.content}</h3>
    {memory.createdByName && <p className="memory-author">by {memory.createdByName}</p>}
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
      {memory.status === 'pending' ? <>{onResolve && <><button className="button button-primary button-small" onClick={() => onResolve(memory, 'override')}>Override</button><button className="button button-quiet button-small" onClick={() => onResolve(memory, 'keep')}>Keep current</button></>}{onWithdraw && <button className="button button-quiet button-small" onClick={() => onWithdraw(memory)}>Withdraw</button>}{!onResolve && !onWithdraw && <span>Waiting for review</span>}</> : <>
        {mayChange && memory.status === 'active' && <button className="button button-quiet button-small" onClick={() => onInvalidate?.(memory)}><Icon name="close" size={14} /> Invalidate</button>}
        {mayChange && <button className="icon-button danger-hover" title="Delete memory" aria-label="Delete memory" onClick={() => onDelete?.(memory)}><Icon name="trash" /></button>}
      </>}
    </div>}
  </article>;
}

function ConflictCard({ conflict, onResolve, onWithdraw, canResolve, busy }) {
  const pending = conflict.pending;
  const target = conflict.target;
  return <section className="conflict-card">
    <div className="conflict-heading"><span className="conflict-icon">↔</span><div><strong>A decision is in conflict</strong><p>Keep what you decided, or replace it with this update.</p></div></div>
    <div className="conflict-compare">
      <div><span className="compare-label">CURRENT</span><p>{target?.content || 'Existing project memory'}</p>{target?.reason && <small>{target.reason}</small>}</div>
      <div><span className="compare-label">NEW</span><p>{pending?.content}</p>{pending?.reason && <small>{pending.reason}</small>}</div>
    </div>
    <div className="conflict-actions">
      {canResolve ? <><button className="button button-primary button-small" disabled={busy} onClick={() => onResolve(pending, 'override')}>Override decision</button><button className="button button-quiet button-small" disabled={busy} onClick={() => onResolve(pending, 'keep')}>Keep current</button></> : <span>Waiting for {conflict.targetAuthorName || target?.createdByName || 'the author'} to review</span>}
      {pending?.userId === conflict.viewerId && <button className="button button-quiet button-small" disabled={busy} onClick={() => onWithdraw(pending)}>Withdraw</button>}
    </div>
  </section>;
}

function App() {
  const [user, setUser] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [projectList, setProjectList] = useState([]);
  const [authPending, setAuthPending] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [login, setLogin] = useState({ name: '', email: '', password: '' });
  const [projectMenu, setProjectMenu] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [userMenu, setUserMenu] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [inviteToken, setInviteToken] = useState(() => window.location.pathname.match(/^\/invite\/([^/]+)/)?.[1] || '');
  const [invitePreview, setInvitePreview] = useState(null);
  const [inviteError, setInviteError] = useState('');
  const projectPath = useCallback((path) => `/api/projects/${projectId}${path}`, [projectId]);
  const [sessionId, setSessionId] = useState(() => `s_${crypto.randomUUID()}`);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [tab, setTab] = useState('used');
  const [lastUsed, setLastUsed] = useState([]);
  const [allMemories, setAllMemories] = useState([]);
  const [needsReview, setNeedsReview] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 801px)').matches);
  const inputRef = useRef(null);
  const feedRef = useRef(null);
  const toastTimer = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { user: currentUser } = await api('/api/auth/me');
        const { projects } = await api('/api/projects');
        setUser(currentUser);
        setProjectList(projects || []);
        let remembered = '';
        try { remembered = localStorage.getItem('hindsight:lastProject') || ''; } catch { /* Storage can be disabled. */ }
        setProjectId(projects?.some((project) => project.id === remembered) ? remembered : (projects?.[0]?.id || ''));
      } catch { /* The sign-in form is shown when there is no valid session cookie. */ }
      finally { setAuthPending(false); }
    })();
  }, []);

  useEffect(() => {
    if (!user || !inviteToken) return;
    api(`/api/invites/${encodeURIComponent(inviteToken)}`).then(setInvitePreview).catch((error) => setInviteError(error.message));
  }, [user, inviteToken]);

  const signIn = async (event) => {
    event.preventDefault();
    setAuthError('');
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const { user: currentUser } = await api(endpoint, { method: 'POST', body: JSON.stringify(login) });
      const { projects } = await api('/api/projects');
      setUser(currentUser);
      setProjectList(projects || []);
      let remembered = '';
      try { remembered = localStorage.getItem('hindsight:lastProject') || ''; } catch { /* Storage can be disabled. */ }
      setProjectId(projects?.some((project) => project.id === remembered) ? remembered : (projects?.[0]?.id || ''));
    } catch (error) { setAuthError(error.message); }
  };

  const createProject = async (event) => {
    event.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const { project } = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: newProjectName.trim() }) });
      setProjectList((items) => [...items, project]); setProjectId(project.id); setNewProjectName(''); setProjectMenu(false);
    } catch (error) { notify(error.message, 'warning'); }
  };

  const loadProjectDetails = useCallback(async () => {
    if (!projectId) return;
    const [detail, feed] = await Promise.all([api(`/api/projects/${projectId}`), api(`/api/projects/${projectId}/activity`)]);
    setMembers(detail.members || []); setActivity(feed.activity || []);
  }, [projectId]);
  const loadActivity = useCallback(async () => {
    if (!projectId) return;
    const result = await api(`/api/projects/${projectId}/activity`);
    setActivity(result.activity || []);
  }, [projectId]);

  const openInvites = async () => {
    setInviteOpen(true); setInviteUrl(''); setInviteExpiry('');
    try { await loadProjectDetails(); } catch (error) { notify(error.message, 'warning'); }
  };
  const createInvite = async () => {
    try { const result = await api(`/api/projects/${projectId}/invites`, { method: 'POST', body: JSON.stringify({}) }); setInviteUrl(result.url); setInviteExpiry(result.expiresAt); }
    catch (error) { notify(error.message, 'warning'); }
  };
  const removeMember = async (member) => {
    try { await api(`/api/projects/${projectId}/members/${member.id}`, { method: 'DELETE' }); await loadProjectDetails(); }
    catch (error) { notify(error.message, 'warning'); }
  };
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); setProjectId(''); setProjectList([]); setUserMenu(false); };

  const joinInvite = async () => {
    try {
      const result = await api(`/api/invites/${encodeURIComponent(inviteToken)}/accept`, { method: 'POST', body: JSON.stringify({}) });
      const { projects } = await api('/api/projects');
      setProjectList(projects || []); setProjectId(result.project?.id || '');
      try { window.history.replaceState({}, '', '/'); } catch { /* Navigation can be restricted in embedded views. */ }
      setInviteToken(''); setInvitePreview(null); setInviteError('');
    } catch (error) { setInviteError(error.message); }
  };

  const notify = useCallback((message, kind = 'success') => {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const handleStreamEvent = useCallback((event) => {
    refreshMemories().catch(() => {});
    loadProjectDetails().catch(() => {});
    if (tab === 'activity') loadActivity();
    if (event?.actorName) {
      const kind = event.memoryType;
      const description = kind ? `added ${['assumption', 'outcome'].includes(kind) ? 'an' : 'a'} ${kind}` : 'added a memory';
      notify(`${event.actorName} ${event.kind === 'member_joined' ? 'joined the project' : event.kind === 'member_removed' ? 'removed a member' : description}`, 'neutral');
    }
  }, [projectId, tab]);

  const refreshMemories = useCallback(async () => {
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (!projectId) return;
    const result = await api(projectPath(`/memories${params.size ? `?${params}` : ''}`));
    setAllMemories(result.memories || []);
    setNeedsReview(result.needsReview || []);
  }, [typeFilter, statusFilter, projectId, projectPath]);

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
      const result = await api(projectPath(`/session/start?sessionId=${encodeURIComponent(nextId)}`));
      setCheckIns(result.checkIns || []);
      setPageError('');
    } catch (error) {
      setPageError(error.message);
    }
  }, [notify, projectPath]);

  useEffect(() => {
    if (startedRef.current || !projectId) return;
    startedRef.current = true;
    startSession(false);
  }, [projectId, startSession]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { if (projectId) { try { localStorage.setItem('hindsight:lastProject', projectId); } catch { /* Storage can be disabled. */ } } }, [projectId]);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => { if (projectId) refreshMemories().catch(() => {}); }, [refreshMemories, projectId]);
  useProjectStream(user ? projectId : '', handleStreamEvent);

  const sendMessage = async (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setPageError('');
    setMessages((items) => [...items, { role: 'user', text, localId: crypto.randomUUID() }]);
    setBusy(true);
    try {
      const result = await api(projectPath('/chat'), { method: 'POST', body: JSON.stringify({ sessionId, message: text, memoryEnabled }) });
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
      await api(projectPath(`/memories/${idOf(memory)}/resolve`), { method: 'POST', body: JSON.stringify({ action }) });
      setMessages((items) => items.map((message) => ({ ...message, conflicts: (message.conflicts || []).filter(({ pending }) => idOf(pending) !== idOf(memory)) })));
      notify(action === 'override' ? 'Decision updated. The previous choice is in the timeline.' : 'Kept the current decision.');
      await refreshMemories();
      if (tab === 'timeline') loadTimeline();
    } catch (error) { notify(error.message, 'warning'); }
    finally { setBusy(false); }
  };

  const withdrawConflict = async (memory) => {
    if (!memory?._id) return;
    try {
      await api(projectPath(`/memories/${idOf(memory)}/withdraw`), { method: 'POST', body: JSON.stringify({}) });
      setMessages((items) => items.map((message) => ({ ...message, conflicts: (message.conflicts || []).filter(({ pending }) => idOf(pending) !== idOf(memory)) })));
      notify('Your pending memory was withdrawn.', 'neutral');
      await refreshMemories();
    } catch (error) { notify(error.message, 'warning'); }
  };

  const mutateMemory = async (memory, action) => {
    if (!memory?._id) return;
    try {
      if (action === 'delete') await api(projectPath(`/memories/${idOf(memory)}`), { method: 'DELETE' });
      if (action === 'invalidate') await api(projectPath(`/memories/${idOf(memory)}/invalidate`), { method: 'POST', body: JSON.stringify({ reason: 'Marked no longer true from the memory panel.' }) });
      if (action === 'confirm') await api(projectPath(`/memories/${idOf(memory)}/confirm`), { method: 'POST', body: JSON.stringify({}) });
      setCheckIns((items) => items.filter((item) => idOf(item.memory) !== idOf(memory)));
      notify(action === 'delete' ? 'Memory permanently deleted.' : action === 'confirm' ? 'Assumption confirmed.' : 'Memory invalidated.');
      await refreshMemories();
    } catch (error) { notify(error.message, 'warning'); }
  };

  const loadTimeline = async () => {
    setTimelineLoading(true);
    try {
      const response = await api(projectPath('/memories?status=superseded'));
      const old = response.memories || [];
      const chains = await Promise.all(old.map(async (memory) => {
        try { return (await api(projectPath(`/memories/${idOf(memory)}/chain`))).chain || [memory]; }
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
    if (next === 'activity') loadActivity().catch((error) => notify(error.message, 'warning'));
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

  if (authPending) return <main className="auth-screen"><p>Loading your project…</p></main>;
  if (!user) return <main className="auth-screen"><form className="auth-card" onSubmit={signIn}><p className="eyebrow">HINDSIGHT</p><h1>Hindsight</h1><div className="auth-tabs"><button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthError(''); }}>Log in</button><button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => { setAuthMode('signup'); setAuthError(''); }}>Sign up</button></div>{authMode === 'signup' && <label>Name<input type="text" value={login.name} onChange={(event) => setLogin({ ...login, name: event.target.value })} required /></label>}<label>Email<input type="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} required /></label><label>Password<input type="password" minLength={authMode === 'signup' ? 8 : undefined} value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} required /></label>{authError && <p className="auth-error">{authError}</p>}<button className="button button-primary" type="submit">{authMode === 'signup' ? 'Sign up' : 'Log in'}</button></form></main>;
  if (inviteToken && !invitePreview) return <main className="auth-screen"><section className="auth-card"><h1>Join project</h1><p>{inviteError || 'Loading invite…'}</p></section></main>;
  if (inviteToken && invitePreview) return <main className="auth-screen"><section className="auth-card"><h1>Join {invitePreview.project.name}, invited by {invitePreview.invitedBy}?</h1>{inviteError && <p className="auth-error">{inviteError}</p>}<button className="button button-primary" onClick={joinInvite}>Join</button></section></main>;
  if (!projectId) return <main className="auth-screen"><form className="auth-card" onSubmit={createProject}><h1>New project</h1><label>Project name<input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} required /></label><button className="button button-primary" type="submit">Create project</button></form></main>;

  return <div className={`app-shell moon-chat-shell is-new-session ${messages.length ? 'has-conversation' : ''}`}>
    <header className="topbar">
      <a className="brand" href="#" aria-label="Hindsight home"><span className="brand-mark"><Icon name="spark" size={18} /></span><span>hindsight</span></a>
      <div className="project-switcher"><button className="quick-pill" aria-expanded={projectMenu} onClick={() => setProjectMenu((value) => !value)}>{projectList.find((project) => project.id === projectId)?.name}<span aria-hidden="true">⌄</span></button>{projectMenu && <div className="glass-menu">{projectList.map((project) => <button key={project.id} onClick={() => { startedRef.current = false; setProjectId(project.id); setMessages([]); setLastUsed([]); try { localStorage.setItem('hindsight:lastProject', project.id); } catch { /* Storage can be disabled. */ } setProjectMenu(false); }}><span>{project.name}</span><small>{project.role}</small></button>)}<form onSubmit={createProject}><input aria-label="New project name" placeholder="Project name" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} /><button type="submit">New project</button></form></div>}</div>
      <div className="topbar-actions">
        <button className="button button-memory" aria-pressed={mobilePanel} onClick={() => setMobilePanel((value) => !value)}><Icon name="book" size={15} /><span>Memory</span></button>
        <label className={`memory-toggle ${memoryEnabled ? 'enabled' : ''}`} title="Memory on or off"><span>Memory</span><input type="checkbox" checked={memoryEnabled} onChange={(event) => setMemoryEnabled(event.target.checked)} /><span className="toggle-track"><i /></span><b>{memoryEnabled ? 'On' : 'Off'}</b></label>
        <button className="quick-pill" onClick={() => startSession(true)}>New session</button>
        {projectList.find((project) => project.id === projectId)?.role === 'owner' && <button className="quick-pill" onClick={openInvites}>Invite</button>}
        <div className="user-menu-wrap"><button className="quick-pill" aria-expanded={userMenu} onClick={() => setUserMenu((value) => !value)}>{user.name}</button>{userMenu && <div className="glass-menu user-menu"><button onClick={logout}>Log out</button></div>}</div>
      </div>
    </header>

    <main className="workspace">
      <section className={`chat-column ${mobilePanel ? 'mobile-hidden' : ''}`} aria-label="Project chat">
        <div className="chat-heading"><div><p className="eyebrow">PROJECT CONVERSATION</p><h1>What are we working on?</h1><p className="heading-subtitle">A thinking partner that remembers the why.</p></div><button className="mobile-panel-button" onClick={() => setMobilePanel(true)}><Icon name="book" /> Memories</button></div>
        {checkIns.length > 0 && <section className="checkins-section"><div className="section-kicker"><span className="pulse-dot" /> A few things to revisit <span className="checkin-count">{checkIns.length}</span></div>{checkIns.map(renderCheckIn)}</section>}
        {pageError && <div className="inline-error"><span>{pageError}</span><button className="text-button" onClick={() => startSession(false)}>Retry</button></div>}
        <div className={`chat-feed ${messages.length ? 'has-messages' : ''}`} ref={feedRef}>
          {messages.length === 0 && <div className="welcome-block"><h2>Hindsight AI</h2><p>Build something meaningful — start with a thought, a decision, or a question.</p></div>}
          {messages.map((message) => <div className={`message-row ${message.role}`} key={message.localId}>
            {message.role === 'assistant' && <span className="assistant-avatar"><Icon name="spark" size={15} /></span>}
            <div className="message-content">
              {message.role === 'user' ? <div className="user-bubble">{message.text}</div> : <>
                <div className={`assistant-copy ${message.failed ? 'failed-copy' : ''}`}><AssistantText text={message.text} /></div>
                {!!message.used?.length && <div className="memory-chips"><span>Remembered</span>{message.used.map(({ memory }) => <button key={idOf(memory)} className="memory-chip" onClick={() => showMemory(memory)} title={memory.content}><span className="chip-mark">↗</span>{memory.content}</button>)}</div>}
                {!!message.changes?.filter((change) => change.kind === 'created').length && <div className="saved-inline"><span className="saved-check"><Icon name="check" size={12} /></span>{message.changes.filter((change) => change.kind === 'created').length} new {message.changes.filter((change) => change.kind === 'created').length === 1 ? 'memory' : 'memories'} saved</div>}
                {(message.notices || []).filter((notice) => !notice.toLowerCase().includes('not saved: looks like a secret')).map((notice, i) => <div className="message-notice" key={i}>{notice}</div>)}
                {!!message.conflicts?.length && <div className="conflict-stack">{message.conflicts.map((conflict) => <ConflictCard key={idOf(conflict.pending)} conflict={{ ...conflict, viewerId: user.id }} canResolve={conflict.canResolveNow !== false} onResolve={resolveConflict} onWithdraw={withdrawConflict} busy={busy} />)}</div>}
              </>}
            </div>
          </div>)}
          {busy && <div className="message-row assistant"><span className="assistant-avatar"><Icon name="spark" size={15} /></span><div className="thinking"><i /><i /><i /><span>Thinking with context</span></div></div>}
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <textarea ref={inputRef} value={draft} onChange={(event) => { setDraft(event.target.value); event.target.style.height = '48px'; event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="Type your request..." rows={1} aria-label="Message Hindsight" />
          <div className="composer-footer"><span><span className="composer-status" />{memoryEnabled ? 'Memory is on for this project' : 'Memory is off for this message'}</span><button className="send-button" disabled={!draft.trim() || busy} aria-label="Send message" type="submit"><Icon name="arrow" size={17} /></button></div>
        </form>
        {messages.length === 0 && <div className="quick-actions" aria-label="Quick prompts">
          {[
            ['code', 'Generate Code', 'Help me implement a feature in this project.'],
            ['spark', 'Launch App', 'Help me plan and launch this app.'],
            ['book', 'UI Components', 'Help me design a useful UI component.'],
            ['spark', 'Theme Ideas', 'Suggest a visual theme for this project.'],
            ['book', 'User Dashboard', 'Help me plan a user dashboard.'],
            ['spark', 'Landing Page', 'Help me create a landing page.'],
            ['book', 'Upload Docs', 'I want to discuss a project document.'],
            ['spark', 'Image Assets', 'Help me plan image assets for this project.']
          ].map(([icon, label, prompt]) => <button key={label} type="button" onClick={() => { setDraft(prompt); inputRef.current?.focus(); }}><Icon name={icon} size={14} />{label}</button>)}
        </div>}
        <p className="privacy-note"><Icon name="book" size={12} /> Your project context stays yours.</p>
      </section>

      <aside className={`memory-panel ${mobilePanel ? 'mobile-visible' : 'is-hidden'}`} aria-label="Project memory" aria-hidden={!mobilePanel}>
        <div className="panel-topline"><div><p className="eyebrow">PROJECT CONTEXT</p><h2>Memory</h2></div><div className="memory-count"><strong>{allMemories.length}</strong><span>memories</span></div><button className="panel-close mobile-panel-button" aria-label="Close memory panel" onClick={() => setMobilePanel(false)}><Icon name="close" /></button></div>
        <div className="panel-tabs" role="tablist" aria-label="Memory views">
          <button role="tab" aria-selected={tab === 'used'} className={tab === 'used' ? 'active' : ''} onClick={() => selectTab('used')}>Used in this reply</button>
          <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => selectTab('all')}>All memories</button>
          <button role="tab" aria-selected={tab === 'timeline'} className={tab === 'timeline' ? 'active' : ''} onClick={() => selectTab('timeline')}>Timeline</button>
          <button role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => selectTab('activity')}>Activity</button>
        </div>
        <div className="panel-body">
          {tab === 'used' && <>
            {lastUsed.length ? <><div className="panel-intro"><span className="panel-live-dot" />These memories shaped the latest reply.</div>{lastUsed.map((entry) => <MemoryCard key={idOf(entry.memory)} memory={entry.memory} used score={entry.finalScore ?? entry.similarity} why={entry.why} mayChange={entry.memory.userId === user.id || projectList.find((project) => project.id === projectId)?.role === 'owner'} selected={selectedId === idOf(entry.memory)} onSelect={showMemory} onInvalidate={(memory) => mutateMemory(memory, 'invalidate')} onDelete={(memory) => mutateMemory(memory, 'delete')} />)}</> : <div className="panel-empty"><span className="empty-illustration"><Icon name="spark" size={21} /></span><h3>No memories used yet</h3><p>When a project memory helps with a reply, you’ll see it here with its match score and source.</p><button className="text-button" onClick={() => selectTab('all')}>Browse all memories <Icon name="arrow" size={13} /></button></div>}
            {selectedMemory && <div className="selected-note"><span className="selected-check"><Icon name="check" size={12} /></span>Selected from chat</div>}
          </>}
          {tab === 'all' && <>
            <div className="filter-row"><label><span className="sr-only">Filter by type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="decision">Decisions</option><option value="assumption">Assumptions</option><option value="constraint">Constraints</option><option value="outcome">Outcomes</option></select></label><label><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="superseded">Superseded</option><option value="invalid">Invalid</option></select></label></div>
            {!!needsReview.length && <section className="review-section"><h3>Needs your review</h3>{needsReview.map((memory) => <MemoryCard key={`review-${idOf(memory)}`} memory={memory} onResolve={resolveConflict} onSelect={showMemory} />)}</section>}
            {allMemories.length ? allMemories.map((memory) => <MemoryCard key={idOf(memory)} memory={memory} selected={selectedId === idOf(memory)} onSelect={showMemory} onResolve={memory.status === 'pending' && needsReview.some((item) => idOf(item) === idOf(memory)) ? resolveConflict : undefined} onWithdraw={memory.status === 'pending' && memory.userId === user.id ? withdrawConflict : undefined} mayChange={memory.userId === user.id || projectList.find((project) => project.id === projectId)?.role === 'owner'} onInvalidate={(item) => mutateMemory(item, 'invalidate')} onDelete={(item) => mutateMemory(item, 'delete')} />) : <div className="panel-empty small-empty"><span className="empty-illustration"><Icon name="book" size={20} /></span><h3>Nothing here yet</h3><p>Decisions and useful context will appear here as you talk.</p></div>}
          </>}
          {tab === 'activity' && <><div className="panel-intro">Project activity, newest first.</div>{activity.map((event) => <article className="activity-row" key={String(event._id)}><span>{event.actorName || 'A teammate'}</span> {event.event === 'member_joined' ? 'joined' : event.event === 'member_removed' ? 'removed a member' : event.event === 'created' ? 'saved a memory' : event.event.replaceAll('_', ' ')}{event.details?.content ? `: ${event.details.content}` : ''}<small>{dateLabel(event.at)}</small></article>)}</>}
          {tab === 'timeline' && <>
            <div className="panel-intro"><Icon name="clock" size={15} /> Follow how project decisions have changed.</div>
            {timelineLoading ? <div className="timeline-loading"><i /> Loading history…</div> : timeline.length ? <div className="timeline-list">{timeline.map((memory, index) => <div className="timeline-entry" key={idOf(memory)}><div className="timeline-rail"><span className={memory.status === 'active' ? 'rail-current' : ''} />{index < timeline.length - 1 && <i />}</div><div className="timeline-card"><div className="memory-meta"><span className={`type-pill type-${memory.type}`}>{typeLabel(memory.type)}</span><span className="memory-date">{dateLabel(memory.createdAt)}</span></div><h3>{memory.content}</h3>{memory.reason && <p className="memory-reason">{memory.reason}</p>}<span className={`timeline-status status-${memory.status}`}>{memory.status === 'active' ? 'Current decision' : memory.status}</span></div></div>)}</div> : <div className="panel-empty small-empty"><span className="empty-illustration"><Icon name="clock" size={20} /></span><h3>No changes to trace</h3><p>When a decision is updated, its history will appear here.</p></div>}
          </>}
        </div>
        <div className="panel-footer"><span className="footer-lock">⌑</span><span>Project memory · QuickBite</span><span className="footer-sync"><i /> Synced</span></div>
      </aside>
    </main>
    {inviteOpen && <div className="glass-backdrop" role="presentation" onClick={() => setInviteOpen(false)}><section className="invite-modal" role="dialog" aria-modal="true" aria-label="Project invites" onClick={(event) => event.stopPropagation()}><h2>Invite to {projectList.find((project) => project.id === projectId)?.name}</h2><button className="quick-pill" onClick={createInvite}>Create invite link</button>{inviteUrl && <div className="invite-link"><input readOnly value={inviteUrl} /><button className="quick-pill" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>Copy</button><small>Expires {dateLabel(inviteExpiry)}</small></div>}<h3>Members</h3>{members.map((member) => <div className="member-row" key={member.id}><span>{member.name}</span><small>{member.role}</small>{projectList.find((project) => project.id === projectId)?.role === 'owner' && member.id !== user.id && <button className="quick-pill" onClick={() => removeMember(member)}>Remove</button>}</div>)}<button className="quick-pill" onClick={() => setInviteOpen(false)}>Close</button></section></div>}
    {toast && <div className={`toast toast-${toast.kind}`} role="status"><span className="toast-icon"><Icon name={toast.kind === 'warning' ? 'close' : 'check'} size={15} /></span>{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={14} /></button></div>}
  </div>;
}

export default App;
