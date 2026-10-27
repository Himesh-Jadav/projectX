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
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    down: <><path d="m7 10 5 5 5-5" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8M8 11h8" /></>,
    quote: <><path d="M10 11H5V6h5v5Zm9 0h-5V6h5v5ZM5 11c0 4 1.5 6 4 7m5-7c0 4 1.5 6 4 7" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>,
    moon: <><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></>
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

function DeleteWorkspaceDialog({ project, onClose, onDeleted }) {
  const dialog = useRef(null);
  const [review, setReview] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  const submit = async (event) => {
    event.preventDefault();
    setPending(true); setError('');
    try {
      if (!review) {
        setReview(await api(`/api/projects/${project.id}/deletion-review`, { method: 'POST' }));
      } else {
        await api(`/api/projects/${project.id}`, { method: 'DELETE', body: JSON.stringify({ token: review.token, name, password }) });
        onDeleted(project.id);
      }
    } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  };
  return <dialog ref={dialog} className="invite-modal delete-workspace-dialog" aria-labelledby="delete-workspace-title" onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <form onSubmit={submit}>
      <small>Step {review ? '2' : '1'} of 2</small>
      <h2 id="delete-workspace-title">Delete workspace permanently?</h2>
      <p><strong>{project.name}</strong> and its chats, memories, invitations and activity will be permanently removed for all members. This cannot be undone. Your account and other workspaces will remain.</p>
      {review && <>
        <p>{review.counts.messages} messages · {review.counts.memories} memories · {review.counts.memberships} members</p>
        <label>Type <strong>{review.name}</strong> to confirm<input autoFocus required autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Your account password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      </>}
      {error && <p className="delete-error" role="alert">{error}</p>}
      <div className="delete-actions"><button type="button" className="quick-pill" disabled={pending} onClick={onClose}>Cancel</button><button className="quick-pill danger-button" type="submit" disabled={pending || (review && (name !== review.name || !password))}>{pending ? 'Please wait…' : review ? 'Permanently delete workspace' : 'Continue to verification'}</button></div>
    </form>
  </dialog>;
}

function AccountSettingsDialog({ user, onClose, onSaved, onLogout }) {
  const dialog = useRef(null);
  const [username, setUsername] = useState(user.username);
  const [usernamePassword, setUsernamePassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const submit = async (event, kind) => {
    event.preventDefault();
    if (kind === 'password' && newPassword !== confirmPassword) { setMessage('New passwords do not match.'); return; }
    setPending(true); setMessage('');
    try {
      const body = kind === 'username' ? { username, currentPassword: usernamePassword } : { currentPassword, newPassword };
      const { user: saved } = await api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(body) });
      onSaved(saved);
      setUsernamePassword(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage(kind === 'username' ? 'Username updated.' : 'Password updated. Other sessions have been signed out.');
    } catch (error) { setMessage(error.message); }
    finally { setPending(false); }
  };
  return <dialog ref={dialog} className="account-dialog" aria-labelledby="account-title" onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <div className="account-dialog-header"><div><p className="eyebrow">YOUR ACCOUNT</p><h2 id="account-title">Account settings</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close account settings"><Icon name="close" /></button></div>
    <div className="account-identity"><span className="account-avatar"><Icon name="user" size={21} /></span><div><strong>{user.username}</strong><small>{user.email}</small></div></div>
    <form onSubmit={(event) => submit(event, 'username')} className="account-form">
      <h3>Username</h3><p>This is how teammates find you for workspace invitations.</p>
      <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9_]{3,30}" minLength={3} maxLength={30} required autoComplete="username" /></label>
      <label>Current password<input type="password" value={usernamePassword} onChange={(event) => setUsernamePassword(event.target.value)} required autoComplete="current-password" /></label>
      <button className="button button-primary" disabled={pending || username.trim().toLowerCase() === user.username}>Save username</button>
    </form>
    <form onSubmit={(event) => submit(event, 'password')} className="account-form">
      <h3>Password</h3>
      <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /></label>
      <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required autoComplete="new-password" /></label>
      <label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required autoComplete="new-password" /></label>
      <button className="button button-primary" disabled={pending}>Change password</button>
    </form>
    {message && <p className="account-message" role="status">{message}</p>}
    <button className="account-signout" type="button" onClick={onLogout}><Icon name="logout" size={16} /> Sign out</button>
  </dialog>;
}

function App() {
  const [user, setUser] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [projectList, setProjectList] = useState([]);
  const [authPending, setAuthPending] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [login, setLogin] = useState({ username: '', email: '', password: '' });
  const [projectMenu, setProjectMenu] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [deleteProject, setDeleteProject] = useState(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
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
  const [mobilePanel, setMobilePanel] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('hindsight-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'dark';
  });
  const inputRef = useRef(null);
  const feedRef = useRef(null);
  const toastTimer = useRef(null);
  const startedRef = useRef(false);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('hindsight-theme', next); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    const timers = new Map();
    const handleScroll = (event) => {
      const target = event.target instanceof HTMLElement ? event.target : document.scrollingElement;
      if (!target) return;
      target.classList.add('scrolling');
      clearTimeout(timers.get(target));
      timers.set(target, setTimeout(() => {
        target.classList.remove('scrolling');
        timers.delete(target);
      }, 800));
    };
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      for (const [target, timer] of timers) {
        clearTimeout(timer);
        target.classList.remove('scrolling');
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { user: currentUser } = await api('/api/auth/me');
        const { projects } = await api('/api/projects');
        const { invitations: pendingInvites = [] } = await api('/api/invitations');
        setUser(currentUser);
        setProjectList(projects || []);
        setInvitations(pendingInvites);
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
      const { invitations: pendingInvites = [] } = await api('/api/invitations');
      setUser(currentUser);
      setProjectList(projects || []);
      setInvitations(pendingInvites);
      let remembered = '';
      try { remembered = localStorage.getItem('hindsight:lastProject') || ''; } catch { /* Storage can be disabled. */ }
      setProjectId(projects?.some((project) => project.id === remembered) ? remembered : (projects?.[0]?.id || ''));
    } catch (error) { setAuthError(error.message); }
  };

  const createProject = async (event) => {
    event.preventDefault();
    if (creatingProject) return;
    setCreatingProject(true);
    try {
      const { project } = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: newProjectName.trim() || 'My workspace' }) });
      startedRef.current = false;
      setProjectList((items) => [...items, project]); setProjectId(project.id); setNewProjectName(''); setProjectMenu(false);
    } catch (error) { notify(error.message, 'warning'); }
    finally { setCreatingProject(false); }
  };

  const workspaceDeleted = (id) => {
    const remaining = projectList.filter((project) => project.id !== id);
    setProjectList(remaining); setDeleteProject(null);
    if (id === projectId) {
      startedRef.current = false;
      const nextId = remaining[0]?.id || '';
      setProjectId(nextId); setMessages([]); setLastUsed([]); setAllMemories([]); setNeedsReview([]); setMembers([]); setActivity([]); setDraft('');
      try { localStorage.setItem('hindsight:lastProject', nextId); localStorage.setItem('smaran:lastProject', nextId); } catch {}
    }
    notify('Workspace permanently deleted.');
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
    setInviteOpen(true); setInviteUrl(''); setInviteExpiry(''); setInviteUsername('');
    try { await loadProjectDetails(); } catch (error) { notify(error.message, 'warning'); }
  };
  const inviteUser = async (event) => {
    event.preventDefault();
    if (!inviteUsername.trim()) return;
    setInviteBusy(true);
    try {
      const result = await api(`/api/projects/${projectId}/invitations`, { method: 'POST', body: JSON.stringify({ username: inviteUsername.trim() }) });
      notify(`Invitation sent to ${result.invitation.username}.`);
      setInviteUsername('');
    } catch (error) { notify(error.message, 'warning'); }
    finally { setInviteBusy(false); }
  };
  const respondToInvitation = async (invitation, action) => {
    try {
      await api(`/api/invitations/${invitation.id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      const [{ projects }, { invitations: pendingInvites = [] }] = await Promise.all([api('/api/projects'), api('/api/invitations')]);
      setProjectList(projects || []); setInvitations(pendingInvites);
      if (action === 'accept') { startedRef.current = false; setProjectId(invitation.workspaceId); setMessages([]); setLastUsed([]); }
    } catch (error) { notify(error.message, 'warning'); }
  };
  const createInvite = async () => {
    try { const result = await api(`/api/projects/${projectId}/invites`, { method: 'POST', body: JSON.stringify({}) }); setInviteUrl(result.url); setInviteExpiry(result.expiresAt); }
    catch (error) { notify(error.message, 'warning'); }
  };
  const removeMember = async (member) => {
    try { await api(`/api/projects/${projectId}/members/${member.id}`, { method: 'DELETE' }); await loadProjectDetails(); }
    catch (error) { notify(error.message, 'warning'); }
  };
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); startedRef.current = false; setUser(null); setProjectId(''); setProjectList([]); setAccountOpen(false); setMessages([]); };

  const joinInvite = async () => {
    try {
      const result = await api(`/api/invites/${encodeURIComponent(inviteToken)}/accept`, { method: 'POST', body: JSON.stringify({}) });
      const { projects } = await api('/api/projects');
      startedRef.current = false;
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
    setDraft('');
    setLastUsed([]);
    setCheckIns([]);
    setSelectedId('');
    setTab('used');
    setPageError('');
    setBusy(false);
    try {
      const result = await api(projectPath(`/session/start?sessionId=${encodeURIComponent(nextId)}`));
      setCheckIns(result.checkIns || []);
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

  const authThemeButton = (
    <button
      type="button"
      className="button button-theme auth-theme-toggle"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
      <span className="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  );

  if (authPending) return <main className={`auth-screen ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}><p>Loading your project…</p></main>;
  if (!user) return <main className={`auth-screen ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>{authThemeButton}<form className="auth-card" onSubmit={signIn}><div className="auth-logo-wrap"><img src={theme === 'dark' ? '/dark_logo.png' : '/light_logo.png'} alt="Smaran.ai" className="auth-logo" /></div><p className="eyebrow">SMARAN.AI</p><h1>Smaran.ai</h1><div className="auth-tabs"><button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthError(''); }}>Log in</button><button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => { setAuthMode('signup'); setAuthError(''); }}>Sign up</button></div>{authMode === 'signup' && <label>Username<input type="text" autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" title="3-30 letters, numbers or underscores" value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} required /><small>3-30 letters, numbers or underscores. Usernames are not case-sensitive.</small></label>}<label>Email<input type="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} required /></label><label>Password<input type="password" minLength={authMode === 'signup' ? 8 : undefined} value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} required /></label>{authError && <p className="auth-error" role="alert">{authError}</p>}<button className="button button-primary" type="submit">{authMode === 'signup' ? 'Sign up' : 'Log in'}</button></form></main>;
  if (inviteToken && !invitePreview) return <main className={`auth-screen ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>{authThemeButton}<section className="auth-card"><h1>Join project</h1><p>{inviteError || 'Loading invite…'}</p></section></main>;
  if (inviteToken && invitePreview) return <main className={`auth-screen ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>{authThemeButton}<section className="auth-card"><h1>Join {invitePreview.project.name}, invited by {invitePreview.invitedBy}?</h1>{inviteError && <p className="auth-error">{inviteError}</p>}<button className="button button-primary" onClick={joinInvite}>Join</button></section></main>;
  if (!projectId) return <main className={`auth-screen ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>{authThemeButton}<form className="auth-card" onSubmit={createProject}><h1>Create a workspace</h1><p>Create a workspace to start chatting and saving project memories.</p><label>Workspace name<input placeholder="My workspace (optional)" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} /></label><button className="button button-primary" type="submit">Create workspace</button></form></main>;

  return <div className={`app-shell is-new-session ${theme === 'dark' ? 'moon-chat-shell theme-dark' : 'theme-light'} ${messages.length ? 'has-conversation' : ''}`}>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={'app-sidebar ' + (sidebarOpen ? 'sidebar-open' : '')} aria-label="Main navigation">
      <div className="sidebar-brand-row"><a className="brand" href="#" aria-label="Smaran.ai home"><img src={theme === 'dark' ? '/dark_logo.png' : '/light_logo.png'} alt="Smaran.ai" className="brand-logo" /></a><button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><Icon name="close" /></button></div>
      <div className="sidebar-section-heading"><span>Projects</span><span className="sidebar-count">{projectList.length}</span></div>
      <label className="sidebar-search"><span className="sr-only">Search workspaces</span><input placeholder="Search workspaces" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} /></label>
      <nav className="sidebar-workspaces" aria-label="Workspaces">
        {projectList.filter((project) => project.name.toLowerCase().includes(projectSearch.toLowerCase())).map((project) => <div className={'sidebar-workspace ' + (project.id === projectId ? 'selected' : '')} key={project.id}>
          <button className="sidebar-workspace-name" aria-current={project.id === projectId ? 'page' : undefined} onClick={() => { startedRef.current = false; setProjectId(project.id); setMessages([]); setLastUsed([]); setSidebarOpen(false); try { localStorage.setItem('smaran:lastProject', project.id); } catch {} }}><Icon name="book" size={16} /><span>{project.name}</span></button>
          {project.role === 'owner' && <button className="sidebar-workspace-delete" title={'Delete ' + project.name} aria-label={'Delete workspace ' + project.name} onClick={() => setDeleteProject(project)}><Icon name="trash" size={15} /></button>}
        </div>)}
        {!projectList.some((project) => project.name.toLowerCase().includes(projectSearch.toLowerCase())) && <p className="sidebar-empty">No matching workspaces</p>}
      </nav>
      <form className="sidebar-create" onSubmit={createProject}><label htmlFor="sidebar-new-workspace">New workspace</label><input id="sidebar-new-workspace" maxLength={120} placeholder="Workspace name" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} /><button className="sidebar-create-button" type="submit" disabled={creatingProject}><Icon name="plus" size={16} />{creatingProject ? 'Creating...' : 'Create workspace'}</button></form>
      <button className="sidebar-account" onClick={() => { setAccountOpen(true); setSidebarOpen(false); }}><span className="sidebar-avatar"><Icon name="user" size={18} /></span><span className="sidebar-account-copy"><strong>{user.username}</strong><small>Account settings</small></span><Icon name="down" size={15} /></button>
    </aside>
    <header className="topbar">
      <button className="topbar-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Icon name="menu" size={20} /></button>
      <span className="topbar-workspace-name">{projectList.find((project) => project.id === projectId)?.name}</span>
      <div className="topbar-actions">
        <button className="button button-memory" aria-expanded={mobilePanel} onClick={() => setMobilePanel((value) => !value)}><Icon name="book" size={16} /><span>Memory</span></button>
        {invitations.length > 0 && <button className="button button-memory" onClick={() => setInviteOpen(true)}><Icon name="book" size={16} /><span>Invitations ({invitations.length})</span></button>}
        {projectList.find((project) => project.id === projectId)?.role === 'owner' && <button className="button button-memory" onClick={openInvites}><Icon name="plus" size={17} /><span>Invite</span></button>}
        <button type="button" className="button button-theme" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /></button>
      </div>
    </header>
    <main className="workspace">
      <section className={`chat-column ${mobilePanel ? 'mobile-hidden' : ''}`} aria-label="Workspace chat">
        <div className="chat-heading"><div><p className="eyebrow">WORKSPACE CONVERSATION</p><h1>What are we working on?</h1><p className="heading-subtitle">A thinking partner that remembers the why.</p></div><button className="mobile-panel-button" onClick={() => setMobilePanel(true)}><Icon name="book" /> Memories</button></div>
        {checkIns.length > 0 && <section className="checkins-section"><div className="section-kicker"><span className="pulse-dot" /> A few things to revisit <span className="checkin-count">{checkIns.length}</span></div>{checkIns.map(renderCheckIn)}</section>}
        {pageError && <div className="inline-error"><span>{pageError}</span><button className="text-button" onClick={() => startSession(false)}>Retry</button></div>}
        <div className={`chat-feed ${messages.length ? 'has-messages' : ''}`} ref={feedRef}>
          {messages.length === 0 && <div className="welcome-block">
            <span className="welcome-mark"><Icon name="spark" size={21} /></span>
            <p className="eyebrow">A THINKING PARTNER FOR YOUR WORK</p>
            <h2>What are we working on?</h2>
            <p>Bring a question, a decision, or a rough idea. Smaran keeps the useful context close.</p>
          </div>}
          {messages.map((message) => <div className={`message-row ${message.role}`} key={message.localId}>
            {message.role === 'assistant' && <span className="assistant-avatar"><Icon name="spark" size={15} /></span>}
            <div className="message-content">
              {message.role === 'user' ? <div className="user-bubble">{message.text}</div> : <>
                <div className={`assistant-copy ${message.failed ? 'failed-copy' : ''}`}>
                  <AssistantText text={message.text} />
                  {!!message.conflicts?.length && <div className="conflict-inline-actions">{message.conflicts.map((conflict) => <div className="conflict-inline-row" key={idOf(conflict.pending)}>
                    {conflict.canResolveNow !== false ? <>
                      <button className="conflict-choice-secondary" disabled={busy} onClick={() => resolveConflict(conflict.pending, 'keep')}>Keep existing</button>
                      <button className="conflict-choice-primary" disabled={busy} onClick={() => resolveConflict(conflict.pending, 'override')}>Override with update</button>
                    </> : conflict.pending?.userId === user.id ? <button className="conflict-choice-secondary" disabled={busy} onClick={() => withdrawConflict(conflict.pending)}>Withdraw my update</button> : <span>Waiting for {conflict.targetAuthorName || conflict.target?.createdByName || 'the author'} to review</span>}
                  </div>)}</div>}
                </div>
                {!!message.used?.length && <div className="memory-chips"><span>Remembered</span>{message.used.map(({ memory }) => <button key={idOf(memory)} className="memory-chip" onClick={() => showMemory(memory)} title={memory.content}><span className="chip-mark">↗</span>{memory.content}</button>)}</div>}
                {!!message.changes?.filter((change) => change.kind === 'created').length && <div className="saved-inline"><span className="saved-check"><Icon name="check" size={12} /></span>{message.changes.filter((change) => change.kind === 'created').length} new {message.changes.filter((change) => change.kind === 'created').length === 1 ? 'memory' : 'memories'} saved</div>}
                {(message.notices || []).filter((notice) => !notice.toLowerCase().includes('not saved: looks like a secret')).map((notice, i) => <div className="message-notice" key={i}>{notice}</div>)}
              </>}
            </div>
          </div>)}
          {busy && <div className="message-row assistant"><span className="assistant-avatar"><Icon name="spark" size={15} /></span><div className="thinking"><i /><i /><i /><span>Thinking with context</span></div></div>}
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <textarea ref={inputRef} value={draft} onChange={(event) => { setDraft(event.target.value); event.target.style.height = '48px'; event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="Type your request..." rows={1} aria-label="Message Smaran.ai" />
          <div className="composer-footer"><span><span className="composer-status" />{memoryEnabled ? 'Memory is on for this workspace' : 'Memory is off for this message'}</span><button className="send-button" disabled={!draft.trim() || busy} aria-label="Send message" type="submit"><Icon name="arrow" size={17} /></button></div>
        </form>

      </section>

      <aside className={`memory-panel ${mobilePanel ? 'mobile-visible' : 'is-hidden'}`} aria-label="Project memory" aria-hidden={!mobilePanel}>
        <div className="panel-topline"><div><p className="eyebrow">WORKSPACE CONTEXT</p><h2>Memory</h2></div><div className="memory-count"><strong>{allMemories.length}</strong><span>memories</span></div><button className="panel-close" aria-label="Close memory panel" onClick={() => setMobilePanel(false)}><Icon name="close" /></button></div>
        <label className={`memory-setting ${memoryEnabled ? 'enabled' : ''}`}>
          <span><strong>Remember conversations</strong><small>Save and recall project decisions</small></span><input type="checkbox" checked={memoryEnabled} onChange={(event) => setMemoryEnabled(event.target.checked)} /><span className="toggle-track"><i /></span>
        </label>
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
      </aside>
    </main>
    {accountOpen && <AccountSettingsDialog user={user} onClose={() => setAccountOpen(false)} onSaved={setUser} onLogout={logout} />}
    {deleteProject && <DeleteWorkspaceDialog project={deleteProject} onClose={() => setDeleteProject(null)} onDeleted={workspaceDeleted} />}
    {inviteOpen && <div className="glass-backdrop" role="presentation" onClick={() => setInviteOpen(false)}><section className="invite-modal" role="dialog" aria-modal="true" aria-label="Workspace invitations" onClick={(event) => event.stopPropagation()}>
      {invitations.length > 0 && <><h2>Workspace invitations</h2>{invitations.map((invitation) => <div className="member-row" key={invitation.id}><span>{invitation.workspace}</span><small>from {invitation.invitedBy}</small><button className="quick-pill" onClick={() => respondToInvitation(invitation, 'accept')}>Accept</button><button className="quick-pill" onClick={() => respondToInvitation(invitation, 'decline')}>Decline</button></div>)}</>}
      {projectList.find((project) => project.id === projectId)?.role === 'owner' && <><h2>Invite to {projectList.find((project) => project.id === projectId)?.name}</h2>
      <form className="invite-user-form" onSubmit={inviteUser}><input aria-label="Username" placeholder="Username or email" value={inviteUsername} onChange={(event) => setInviteUsername(event.target.value)} /><button className="quick-pill" type="submit" disabled={inviteBusy}>{inviteBusy ? 'Sending…' : 'Invite member'}</button></form>
      <button className="quick-pill" onClick={createInvite}>Create invite link</button>{inviteUrl && <div className="invite-link"><input readOnly value={inviteUrl} /><button className="quick-pill" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>Copy</button><small>Expires {dateLabel(inviteExpiry)}</small></div>}</>}
      <h3>Members</h3>{members.map((member) => <div className="member-row" key={member.id}><span>{member.username}</span><small>{member.role}</small>{projectList.find((project) => project.id === projectId)?.role === 'owner' && member.id !== user.id && <button className="quick-pill" onClick={() => removeMember(member)}>Remove</button>}</div>)}<button className="quick-pill" onClick={() => setInviteOpen(false)}>Close</button>
    </section></div>}
    {toast && <div className={`toast toast-${toast.kind}`} role="status"><span className="toast-icon"><Icon name={toast.kind === 'warning' ? 'close' : 'check'} size={15} /></span>{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={14} /></button></div>}
  </div>;
}

export default App;
