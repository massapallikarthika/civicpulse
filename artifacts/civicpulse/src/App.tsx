import { useMemo, useState, useEffect, createContext, useContext, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useNavigate, useParams, useLocation, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useGetCurrentUser, useLogin, useRegister, useLogout, getGetCurrentUserQueryKey,
  useGetDashboard, useGetWards, getGetWardsQueryKey,
  useCreateWard, useUpdateWard, useDeleteWard, useGetComplaints, getGetComplaintsQueryKey,
  useCreateComplaint, useGetComplaint, getGetComplaintQueryKey, useUpdateComplaint,
  useArchiveComplaint, useAnalyzeComplaint, useGetProjects, getGetProjectsQueryKey,
  useCreateProject, useUpdateProject, useDeleteProject, useGetResources, getGetResourcesQueryKey,
  useCreateResource, useUpdateResource, useDeleteResource, useGetServices, getGetServicesQueryKey,
  useCreateService, useUpdateService, useDeleteService, useGetAiInsights,
  getGetAiInsightsQueryKey, useGenerateAiInsights, useUpdateAiInsight, useGetProfile,
  getGetProfileQueryKey, useUpdateProfile, useGetHealth,
} from '@workspace/api-client-react';
import type { Ward, Complaint, ComplaintStatus, Project, Resource, Service } from '@workspace/api-client-react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight,
  Check, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp,
  ClipboardList, Clock3, Eye, EyeOff, FolderKanban, Gauge, Landmark, Lightbulb, LogOut, Map,
  Menu, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Settings2,
  ShieldCheck, Sparkles, Trash2, Wallet, X, type LucideIcon,
} from 'lucide-react';

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
type ToastItem = { id: number; text: string; kind: 'success' | 'error' };
const ToastContext = createContext<(text: string, kind?: ToastItem['kind']) => void>(() => {});
const useToast = () => useContext(ToastContext);
const money = (value: number | undefined, code?: string) => new Intl.NumberFormat(undefined, code ? { style: 'currency', currency: code, maximumFractionDigits: 0 } : { maximumFractionDigits: 0 }).format(value ?? 0);
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';
const label = (value?: string | null) => (value || '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

function App() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const notify = (text: string, kind: ToastItem['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(old => [...old, { id, text, kind }]);
    window.setTimeout(() => setToasts(old => old.filter(t => t.id !== id)), 3600);
  };
  return <QueryClientProvider client={client}><ToastContext.Provider value={notify}><BrowserRouter><Routes>
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route element={<ProtectedShell />}>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/complaints" element={<Complaints />} />
      <Route path="/complaints/:id" element={<ComplaintDetail />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/resources" element={<Resources />} />
      <Route path="/services" element={<Services />} />
      <Route path="/wards" element={<Wards />} />
      <Route path="/ai-insights" element={<Insights />} />
      <Route path="/profile" element={<ProfilePage />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter>
    <div className="toast-stack" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}><span>{t.kind === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}</span>{t.text}</div>)}</div>
  </ToastContext.Provider></QueryClientProvider>;
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate(); const toast = useToast(); const login = useLogin(); const register = useRegister(); const qc = useQueryClient();
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const fd = new FormData(e.currentTarget);
    const data = Object.fromEntries(fd.entries());
    setBusy(true);
    try {
      const result = mode === 'login'
        ? await login.mutateAsync({ data: { email: String(data.email), password: String(data.password) } })
        : await register.mutateAsync({ data: { email: String(data.email), password: String(data.password), full_name: String(data.full_name) } });
      if (result?.user) { await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); toast(mode === 'login' ? 'Welcome back.' : 'Officer account created.'); navigate('/dashboard'); }
      else navigate('/dashboard');
    } catch (err: any) { setError(err?.message || 'We could not complete sign in. Check your details and try again.'); }
    finally { setBusy(false); }
  };
  return <main className="auth-layout"><section className="auth-story">
    <div className="brand-mark"><Landmark size={21}/><span>Civic<span>Pulse</span></span></div>
    <div className="auth-story-copy"><p className="eyebrow">LOCAL GOVERNMENT · OPERATIONS</p><h1>Better decisions.<br/><em>Stronger</em> neighborhoods.</h1><p>One clear view of the work that moves your community forward.</p></div>
    <div className="auth-foot"><ShieldCheck size={16}/> Secure access for public service teams <span>·</span> Session protected</div>
    <div className="auth-rings" aria-hidden="true"><i/><i/><i/></div>
  </section><section className="auth-panel"><div className="auth-form-wrap">
    <p className="eyebrow">{mode === 'login' ? 'OFFICER PORTAL' : 'GET STARTED'}</p><h2>{mode === 'login' ? 'Sign in to CivicPulse' : 'Create your account'}</h2><p className="subtle">{mode === 'login' ? 'Use your municipal account to continue.' : 'Register with your work email to join your team.'}</p>
    {error && <div className="inline-error" role="alert"><AlertCircle size={17}/>{error}</div>}
    <form onSubmit={submit} className="form-stack">
      {mode === 'register' && <Field name="full_name" label="Full name" required placeholder="Your name" autoComplete="name"/>}
      <Field name="email" label="Work email" required type="email" placeholder="you@municipality.gov" autoComplete="email"/>
      <PasswordField name="password" label="Password" required placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8}/>
      <button className="button primary full" disabled={busy}>{busy ? <><span className="mini-loader"/> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</> : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={17}/></>}</button>
    </form><p className="auth-switch">{mode === 'login' ? 'New to CivicPulse?' : 'Already have an account?'} <Link to={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Link></p>
    <div className="auth-note"><ShieldCheck size={16}/><span>Your information stays within your municipality’s secure session.</span></div>
  </div></section></main>;
}

function ProtectedShell() {
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  const location = useLocation();
  if (user.isLoading) return <div className="screen-loading"><div className="load-brand"><Landmark size={20}/> CivicPulse</div><div className="skeleton skeleton-title"/><div className="skeleton skeleton-line"/></div>;
  if (user.isError || !user.data) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Shell user={user.data}/>;
}

const navGroups: { title: string; items: { to: string; name: string; icon: LucideIcon }[] }[] = [
  { title: 'OVERVIEW', items: [{ to: '/dashboard', name: 'Dashboard', icon: Gauge }] },
  { title: 'OPERATIONS', items: [{ to: '/complaints', name: 'Complaints', icon: ClipboardList }, { to: '/projects', name: 'Projects', icon: FolderKanban }, { to: '/services', name: 'Services', icon: Activity }] },
  { title: 'PLANNING', items: [{ to: '/wards', name: 'Wards', icon: Map }, { to: '/resources', name: 'Resources', icon: Wallet }, { to: '/ai-insights', name: 'AI insights', icon: Sparkles }] },
];
function Shell({ user }: { user: any }) {
  const [menuOpen, setMenuOpen] = useState(false); const [mobileOpen, setMobileOpen] = useState(false); const logout = useLogout(); const navigate = useNavigate(); const toast = useToast(); const qc = useQueryClient(); const location = useLocation();
  const health = useGetHealth();
  const leave = async () => { try { await logout.mutateAsync(); qc.removeQueries({ queryKey: getGetCurrentUserQueryKey() }); navigate('/login'); } catch { toast('Unable to sign out. Please retry.', 'error'); } };
  const activeName = navGroups.flatMap(g => g.items).find(n => location.pathname === n.to || location.pathname.startsWith(n.to + '/'))?.name || 'Profile';
  return <div className="app-shell">
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand-mark sidebar-brand"><span className="brand-icon"><Landmark size={19}/></span><span>Civic<span>Pulse</span></span></div>
      <div className="workspace-label"><span className="status-dot"/> MUNICIPAL OPERATIONS</div>
      <nav className="side-nav" aria-label="Main navigation">{navGroups.map(group => <div className="nav-group" key={group.title}><p>{group.title}</p>{group.items.map(item => <NavLink onClick={() => setMobileOpen(false)} key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`}><item.icon size={18}/><span>{item.name}</span>{item.to === '/ai-insights' && <span className="nav-badge">AI</span>}</NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><CircleHelp size={17}/><div><strong>Need a hand?</strong><span>Contact your support lead</span></div></div>
        <div className="officer-row"><div className="avatar">{(user.full_name || 'O').split(' ').map((x: string) => x[0]).slice(0,2).join('').toUpperCase()}</div><div className="officer-info"><b>{user.full_name}</b><span>{user.title || user.department || 'Municipal officer'}</span></div><button className="icon-button sidebar-menu" aria-label="Account menu" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={18}/></button>
          {menuOpen && <div className="account-menu"><Link to="/profile" onClick={() => setMenuOpen(false)}><Settings2 size={15}/> Profile settings</Link><button onClick={leave}><LogOut size={15}/> Sign out</button></div>}
        </div>
      </div>
    </aside>
    <div className="main-column"><header className="topbar"><div className="top-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20}/></button><span className="crumb-root">Operations</span><ChevronRight size={14}/><span className="crumb-current">{activeName}</span></div><div className="top-right"><span className="today"><span className={`status-dot ${health.isError ? 'offline' : ''}`}/>{health.isLoading ? 'Checking systems' : health.isError ? 'System status unavailable' : label(health.data?.status)}</span><button className="icon-button notification" aria-label="Review AI insights" onClick={() => navigate('/ai-insights')}><Sparkles size={18}/></button><Link className="top-avatar" to="/profile">{(user.full_name || 'O').charAt(0).toUpperCase()}</Link></div></header><main className="page-content"><OutletFallback /></main></div>
  </div>;
}
// The shell route outlet is provided through this small bridge component.
function OutletFallback() { return <Outlet/>; }

function PageHeading({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow || 'CIVICPULSE / OPERATIONS'}</p><h1>{title}</h1>{detail && <p className="page-detail">{detail}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Panel({ children, title, subtitle, action, className = '' }: { children: ReactNode; title?: string; subtitle?: string; action?: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{(title || action) && <div className="panel-head"><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{action}</div>}{children}</section>;
}
function Button({ children, onClick, variant = 'secondary', disabled, type = 'button', className = '', title }: { children: ReactNode; onClick?: () => void; variant?: string; disabled?: boolean; type?: 'button' | 'submit'; className?: string; title?: string }) {
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`button ${variant} ${className}`}>{children}</button>;
}
function Field({ label: caption, name, required, type = 'text', placeholder, defaultValue, value, onChange, min, max, step, autoComplete, minLength, disabled }: any) {
  return <label className="field"><span>{caption}{required && <i> *</i>}</span><input name={name} required={required} type={type} placeholder={placeholder} defaultValue={defaultValue} value={value} onChange={onChange} min={min} max={max} step={step} autoComplete={autoComplete} minLength={minLength} disabled={disabled}/></label>;
}
function PasswordField({ label: caption, name, required, placeholder, autoComplete, minLength }: any) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>{caption}{required && <i> *</i>}</span><div className="field-pw"><input name={name} required={required} type={visible ? 'text' : 'password'} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength}/><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={15}/> : <Eye size={15}/>}</button></div></label>;
}
function SelectField({ label: caption, name, options, value, defaultValue, onChange, required }: any) {
  return <label className="field"><span>{caption}{required && <i> *</i>}</span><select name={name} value={value} defaultValue={defaultValue} onChange={onChange} required={required}>{options.map((o: any) => <option value={o.value} key={o.value}>{o.label}</option>)}</select></label>;
}
function Modal({ title, description, close, children, wide = false }: { title: string; description?: string; close: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={19}/></button></div>{children}</section></div>;
}
function QueryState({ loading, error, retry, children, empty, emptyTitle = 'Nothing here yet' }: any) {
  if (loading) return <div className="skeleton-list"><div className="skeleton skeleton-line"/><div className="skeleton skeleton-line"/><div className="skeleton skeleton-line"/></div>;
  if (error) return <div className="state-box error-state"><AlertCircle size={22}/><strong>We couldn’t load this information</strong><span>Check your connection and try again.</span><Button onClick={retry}><RefreshCw size={15}/> Retry</Button></div>;
  if (empty) return <div className="state-box"><div className="empty-icon"><ClipboardList size={22}/></div><strong>No records to show</strong><span>{emptyTitle}</span></div>;
  return children;
}
function Badge({ value, className = '' }: { value: string; className?: string }) {
  const tone = ['critical', 'high', 'needs_attention', 'on_hold', 'dismissed'].includes(value) ? 'danger' : ['medium', 'planned', 'new'].includes(value) ? 'warning' : ['resolved', 'completed', 'good', 'acknowledged'].includes(value) ? 'good' : ['active', 'in_progress'].includes(value) ? 'blue' : 'neutral';
  return <span className={`badge ${tone} ${className}`}>{label(value)}</span>;
}
function StatCard({ icon: Icon, label: title, value, note, accent }: any) {
  return <article className="stat-card"><div className={`stat-icon ${accent || ''}`}><Icon size={19}/></div><div className="stat-main"><span>{title}</span><strong>{value ?? '—'}</strong><small>{note}</small></div><ArrowUpRight className="stat-arrow" size={16}/></article>;
}

function Dashboard() {
  const q = useGetDashboard(); const d: any = q.data; const currency = d?.resources?.currency_code || 'INR';
  const priorities = d?.complaints?.by_priority || []; const totalPriority = Math.max(1, priorities.reduce((s: number, x: any) => s + x.count, 0));
  const prioritiesOrder = ['critical', 'high', 'medium', 'low'];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <><PageHeading title={greeting} detail="Here’s the current picture across your municipality." action={<span className="date-chip"><Clock3 size={15}/>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>}/>
    <QueryState loading={q.isLoading} error={q.isError} retry={() => q.refetch()} empty={!d}>
      <><div className="stat-grid">
        <StatCard icon={ClipboardList} label="Open complaints" value={d?.complaints?.pending} note={`${d?.complaints?.high_critical ?? '—'} high priority`} accent="coral"/>
        <StatCard icon={FolderKanban} label="Active projects" value={d?.projects?.active} note={`${d?.projects?.delayed ?? '—'} requiring attention`} accent="blue"/>
        <StatCard icon={Wallet} label="Budget remaining" value={money(d?.resources?.remaining, currency)} note={`${money(d?.resources?.spent, currency)} spent to date`} accent="gold"/>
        <StatCard icon={Activity} label="Service coverage" value={d?.services?.average_coverage != null ? `${d.services.average_coverage}%` : '—'} note={`${d?.services?.average_satisfaction ?? '—'}% citizen satisfaction`} accent="green"/>
      </div><div className="dashboard-grid">
        <Panel className="priority-panel" title="Complaints by priority" subtitle="Current open workload"><div className="priority-content"><div className="priority-list">{prioritiesOrder.map(priority => { const found = priorities.find((p: any) => p.priority === priority); const count = found?.count ?? 0; return <div className="priority-item" key={priority}><div className={`priority-dot ${priority}`}/><span>{label(priority)}</span><b>{count}</b><div className="priority-track"><i className={priority} style={{ width: `${Math.max(3, count / totalPriority * 100)}%` }}/></div></div>; })}</div><div className="priority-total"><b>{d?.complaints?.total ?? '—'}</b><span>total<br/>records</span></div></div></Panel>
        <Panel title="Resource position" subtitle="Municipal budget overview" action={<Link to="/resources" className="text-link">View ledger <ArrowRight size={14}/></Link>}><div className="resource-summary"><div className="resource-top"><div><span>Allocated</span><strong>{money(d?.resources?.allocated, currency)}</strong></div><div className="resource-spent"><span>Spent</span><strong>{money(d?.resources?.spent, currency)}</strong></div></div><div className="resource-track"><i style={{ width: `${d?.resources?.allocated ? Math.min(100, (d.resources.spent / d.resources.allocated) * 100) : 0}%` }}/></div><div className="resource-foot"><span><i className="legend-dot dark-green"/> Utilized</span><span>{d?.resources?.allocated ? ((d.resources.spent / d.resources.allocated) * 100).toFixed(1) : '—'}%</span><span>Remaining <b>{money(d?.resources?.remaining, currency)}</b></span></div></div></Panel>
      </div><div className="dashboard-grid lower-grid"><Panel title="Ward performance" subtitle="Open concerns and service score" action={<Link to="/wards" className="text-link">All wards <ArrowRight size={14}/></Link>}><QueryState loading={false} error={false} empty={!d?.ward_performance?.length}><div className="ward-perf-list">{d?.ward_performance?.slice(0, 5).map((w: any) => <div className="ward-perf-row" key={w.ward_id}><div className="ward-label"><span className="ward-seal">{w.ward_name?.slice(0,1) || 'W'}</span><b>{w.ward_name}</b></div><div className="ward-complaints"><b>{w.open_complaints}</b><small>open</small></div><div className="service-score"><div className="score-track"><i style={{ width: `${w.service_score}%` }}/></div><b>{w.service_score}%</b></div></div>)}</div></QueryState></Panel>
        <Panel title="Recent activity" subtitle="Latest operational updates" action={<span className="live-tag"><span className="status-dot"/> LIVE</span>}><QueryState loading={false} error={false} empty={!d?.recent_activity?.length}><div className="activity-list">{d?.recent_activity?.slice(0, 5).map((a: any) => <div className="activity-row" key={a.id}><span className="activity-mark"><Activity size={14}/></span><div><b>{a.summary}</b><small>{label(a.entity_type)} · {date(a.created_at)}</small></div></div>)}</div></QueryState></Panel></div>
      <section className="ai-band"><div className="ai-band-icon"><Sparkles size={20}/></div><div className="ai-band-copy"><span className="eyebrow">DECISION SUPPORT</span><h2>Evidence-led insights for your next move</h2><p>{d?.ai_insights?.length ?? 0} saved recommendations based on your operational data.{d?.ai_insights?.[0]?.title ? ` Latest: ${d.ai_insights[0].title}` : ''}</p></div><Link to="/ai-insights" className="button dark-button">Review insights <ArrowRight size={16}/></Link></section></>
    </QueryState></>;
}

function Complaints() {
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [priority, setPriority] = useState(''); const [category, setCategory] = useState(''); const [ward, setWard] = useState(''); const [sort, setSort] = useState('newest'); const [page, setPage] = useState(1); const [showCreate, setShowCreate] = useState(false);
  const params = useMemo(() => ({ page, page_size: 10, sort_by: sort === 'title' ? 'title' : 'created_at', sort_order: (sort === 'oldest' || sort === 'title' ? 'asc' : 'desc') as 'asc' | 'desc', ...(search ? { q: search } : {}), ...(status ? { status: status as any } : {}), ...(priority ? { priority: priority as any } : {}), ...(category ? { category: category as any } : {}), ...(ward ? { ward_id: ward } : {}) }), [page, search, status, priority, category, ward, sort]);
  const q = useGetComplaints(params); const wardsQ = useGetWards({ page_size: 100 }); const create = useCreateComplaint(); const archive = useArchiveComplaint(); const qc = useQueryClient(); const toast = useToast();
  const list: any = q.data; const records: Complaint[] = list?.data || []; const pagination = list?.pagination;
  const createRecord = async (data: any) => { await create.mutateAsync({ data }); await qc.invalidateQueries({ queryKey: getGetComplaintsQueryKey(params) }); setShowCreate(false); toast('Complaint received and added to the queue.'); };
  const archiveRecord = async (id: string) => { if (!window.confirm('Archive this complaint? It will no longer appear in the active queue.')) return; try { await archive.mutateAsync({ id }); await qc.invalidateQueries({ queryKey: getGetComplaintsQueryKey(params) }); toast('Complaint archived.'); } catch { toast('Could not archive this complaint.', 'error'); } };
  return <><PageHeading title="Complaints" detail="Intake, triage and track constituent concerns." action={<Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={17}/> New complaint</Button>}/>
    <div className="summary-strip"><div><span>Showing</span><b>{pagination?.total ?? (q.isLoading ? '—' : records.length)}</b><span>records</span></div><div className="strip-divider"/><div><span>Queue updated</span><b>{q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</b></div><div className="strip-spacer"/><div className="filters"><label className="search-box"><Search size={16}/><input aria-label="Search complaints" placeholder="Search complaints…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={14}/></button>}</label><SelectField label="" name="status" value={status} onChange={(e: any) => { setStatus(e.target.value); setPage(1); }} options={[{ value: '', label: 'All statuses' }, ...['open', 'acknowledged', 'in_progress', 'resolved', 'closed'].map(x => ({ value: x, label: label(x) }))]}/><SelectField label="" name="priority" value={priority} onChange={(e: any) => { setPriority(e.target.value); setPage(1); }} options={[{ value: '', label: 'All priorities' }, ...['critical', 'high', 'medium', 'low'].map(x => ({ value: x, label: label(x) }))]}/><SelectField label="" name="category" value={category} onChange={(e: any) => { setCategory(e.target.value); setPage(1); }} options={[{ value: '', label: 'All categories' }, ...['water_supply','sanitation','roads','street_lighting','healthcare','public_safety','other'].map(x => ({ value: x, label: label(x) }))]}/><SelectField label="" name="ward" value={ward} onChange={(e: any) => { setWard(e.target.value); setPage(1); }} options={[{ value: '', label: 'All wards' }, ...(wardsQ.data?.data || []).map(w => ({ value: w.id, label: w.name }))]}/><SelectField label="" name="sort" value={sort} onChange={(e: any) => { setSort(e.target.value); setPage(1); }} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'title', label: 'Title A–Z' }]}/></div></div>
    <Panel className="table-panel"><QueryState loading={q.isLoading} error={q.isError} retry={() => q.refetch()} empty={!records.length}><div className="table-wrap"><table><thead><tr><th>Complaint</th><th>Ward</th><th>Category</th><th>Priority</th><th>Status</th><th>Received</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{records.map(c => <tr key={c.id}><td><Link className="table-primary" to={`/complaints/${c.id}`}>{c.title}</Link><small className="table-secondary">{c.department || label(c.category)}</small></td><td>{c.ward_name || '—'}</td><td>{label(c.category)}</td><td><Badge value={c.priority}/></td><td><Badge value={c.status}/></td><td>{date(c.created_at)}</td><td><button aria-label={`Archive ${c.title}`} className="icon-button" disabled={!!c.archived_at || archive.isPending} onClick={() => archiveRecord(c.id)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div></QueryState>
      {!!records.length && <div className="pagination"><span>Page {pagination?.page || page} of {pagination?.total_pages || 1} <i>·</i> {pagination?.total ?? records.length} total</span><div><Button disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}><ChevronLeft size={16}/> Previous</Button><Button disabled={page >= (pagination?.total_pages || 1)} onClick={() => setPage(page + 1)}>Next <ChevronRight size={16}/></Button></div></div>}
    </Panel>
    {showCreate && <Modal title="Log a complaint" description="Capture the concern with enough context for a useful response." close={() => setShowCreate(false)} wide><ComplaintForm wards={wardsQ.data?.data || []} wardsLoading={wardsQ.isLoading} busy={create.isPending} onSubmit={createRecord} onCancel={() => setShowCreate(false)}/></Modal>}
  </>;
}
function ComplaintForm({ wards, wardsLoading, busy, onSubmit, onCancel }: any) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const d: any = Object.fromEntries(fd.entries());
    if (!d.ward_id) return;
    onSubmit({ ...d, department: d.department || null });
  };
  return <form className="form-stack modal-form" onSubmit={submit}><div className="form-grid">
    <Field name="title" label="Complaint title" required placeholder="Briefly describe the issue"/>
    <label className="field">
      <span>Ward <i> *</i></span>
      <select name="ward_id" required>
        {wardsLoading
          ? <option value="">Loading wards…</option>
          : wards.length === 0
            ? <option value="">No wards yet — create one first</option>
            : <><option value="">Select a ward</option>{wards.map((w: Ward) => <option key={w.id} value={w.id}>{w.name}</option>)}</>
        }
      </select>
    </label>
    <SelectField name="category" label="Category" options={['other', 'water_supply', 'sanitation', 'roads', 'street_lighting', 'healthcare', 'public_safety'].map(x => ({ value: x, label: label(x) }))}/>
    <SelectField name="priority" label="Priority" options={['medium', 'low', 'high', 'critical'].map(x => ({ value: x, label: label(x) }))}/>
    <Field name="department" label="Responsible department" placeholder="Optional"/>
    <label className="field full-span"><span>Description *</span><textarea name="description" required minLength={10} placeholder="What happened, where, and when? Include details that will help the response team." rows={4}/></label></div>
    <div className="modal-actions"><Button onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || wardsLoading || wards.length === 0}>{busy ? 'Saving…' : 'Submit complaint'} <ArrowRight size={16}/></Button></div></form>;
}

function ComplaintDetail() {
  const { id = '' } = useParams(); const q = useGetComplaint(id, { query: { queryKey: getGetComplaintQueryKey(id), enabled: !!id } }); const complaint: any = q.data;
  const update = useUpdateComplaint(); const analyze = useAnalyzeComplaint(); const qc = useQueryClient(); const toast = useToast(); const [review, setReview] = useState<any>(null);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: getGetComplaintQueryKey(id) }); await qc.invalidateQueries({ queryKey: getGetComplaintsQueryKey() }); };
  const setStatus = async (status: ComplaintStatus) => { try { await update.mutateAsync({ id, data: { status } }); await refresh(); toast(`Status updated to ${label(status)}.`); } catch { toast('Status could not be updated.', 'error'); } };
  const getAnalysis = async () => { try { const res: any = await analyze.mutateAsync({ id }); setReview(res?.analysis || res); } catch { toast('Analysis is unavailable right now.', 'error'); } };
  const applyAnalysis = async () => { try { await update.mutateAsync({ id, data: { category: review.category, priority: review.priority, department: review.department } }); await refresh(); setReview(null); toast('AI suggestions applied to this complaint.'); } catch { toast('Suggestions could not be applied.', 'error'); } };
  return <><PageHeading title={complaint?.title || 'Complaint details'} detail="Review the report, manage its status and evaluate decision support." action={<Link className="button secondary" to="/complaints"><ArrowLeft size={16}/> Back to complaints</Link>}/>
    <QueryState loading={q.isLoading} error={q.isError} retry={() => q.refetch()} empty={!complaint}><div className="detail-layout"><div className="detail-main"><Panel className="complaint-summary"><div className="detail-tags"><Badge value={complaint?.priority}/><Badge value={complaint?.status}/><span className="detail-id">REF {complaint?.id}</span></div><p className="complaint-description">{complaint?.description}</p><div className="metadata-grid"><div><span>Ward</span><b>{complaint?.ward_name || '—'}</b></div><div><span>Category</span><b>{label(complaint?.category)}</b></div><div><span>Department</span><b>{complaint?.department || 'Not assigned'}</b></div><div><span>Received</span><b>{date(complaint?.created_at)}</b></div></div></Panel>
      <Panel title="Decision support" subtitle={complaint?.ai_analyzed_at ? `Last analyzed ${date(complaint.ai_analyzed_at)}${complaint.ai_model ? ` · ${complaint.ai_model}` : ''}` : 'AI analysis is optional and should be reviewed before action.'} action={<Button onClick={getAnalysis} disabled={analyze.isPending}><Sparkles size={16}/>{analyze.isPending ? 'Analyzing…' : complaint?.ai_summary ? 'Run again' : 'Analyze complaint'}</Button>}>
        {review ? <div className="analysis-review"><div className="review-banner"><AlertTriangle size={17}/><span>Suggested changes need your review before they are applied.</span></div><div className="analysis-grid"><div><span>Category</span><b>{label(review.category)}</b></div><div><span>Priority</span><Badge value={review.priority}/></div><div><span>Department</span><b>{review.department}</b></div><div><span>Confidence</span><b>{review.confidence != null ? `${Math.round(review.confidence * 100)}%` : '—'}</b></div></div><div className="analysis-copy"><span>Summary</span><p>{review.summary}</p><span>Recommended action</span><p>{review.recommended_action}</p></div><div className="modal-actions"><Button onClick={() => setReview(null)}>Discard</Button><Button variant="primary" onClick={applyAnalysis}>Apply suggestions <Check size={16}/></Button></div></div>
          : complaint?.ai_summary ? <div className="stored-analysis"><div className="analysis-copy"><span>Summary</span><p>{complaint.ai_summary}</p><span>Recommended action</span><p>{complaint.ai_recommended_action || 'No action recommendation recorded.'}</p></div><p className="disclaimer"><ShieldCheck size={14}/> AI output is a decision-support aid. Confirm against local policy and evidence.</p></div>
          : <div className="analysis-empty"><div className="empty-icon"><Sparkles size={20}/></div><div><b>No analysis saved</b><p>Generate an analysis to review a summary, priority and suggested next action.</p></div></div>}
      </Panel></div><aside className="detail-side"><Panel title="Update status" subtitle="Keep the response queue current."><div className="status-actions">{(['open', 'acknowledged', 'in_progress', 'resolved', 'closed'] as ComplaintStatus[]).map(s => <button key={s} disabled={complaint?.status === s || update.isPending} onClick={() => setStatus(s)} className={`status-option ${complaint?.status === s ? 'current' : ''}`}><span className={`status-radio ${complaint?.status === s ? 'checked' : ''}`}/>{label(s)}{complaint?.status === s && <Check size={15}/>}</button>)}</div></Panel><Panel title="Record history"><div className="history-line"><span className="history-dot"/><div><b>Complaint submitted</b><small>{date(complaint?.created_at)}</small></div></div><div className="history-line"><span className="history-dot muted-dot"/><div><b>Last updated</b><small>{date(complaint?.updated_at)}</small></div></div>{complaint?.archived_at && <div className="history-line"><span className="history-dot muted-dot"/><div><b>Archived</b><small>{date(complaint.archived_at)}</small></div></div>}</Panel></aside></div></QueryState>
  </>;
}

type FieldDef = { name: string; label: string; type?: string; options?: (string | { value: string; label: string })[]; required?: boolean; numeric?: boolean; min?: number; max?: number };
function EntityForm({ fields, initial, onSubmit, busy, onCancel }: any) {
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const result: any = {}; fields.forEach((f: FieldDef) => { const value = fd.get(f.name); if (value !== null && value !== '') result[f.name] = f.numeric ? Number(value) : value; else if (f.name === 'description' || f.name === 'deadline' || f.name === 'ward_id') result[f.name] = null; }); onSubmit(result); };
  return <form className="form-stack modal-form" onSubmit={submit}><div className="form-grid">{fields.map((f: FieldDef) => f.options ? <SelectField key={f.name} name={f.name} label={f.label} required={f.required} defaultValue={initial?.[f.name] ?? (typeof f.options[0] === 'string' ? f.options[0] : f.options[0]?.value)} options={f.options.map(v => typeof v === 'string' ? ({ value: v, label: label(v) }) : v)}/> : <Field key={f.name} name={f.name} label={f.label} required={f.required} type={f.type || (f.numeric ? 'number' : 'text')} min={f.min} max={f.max} step={f.numeric ? 'any' : undefined} defaultValue={initial?.[f.name] ?? ''} placeholder={f.type === 'date' ? undefined : f.label}/>)}</div><div className="modal-actions"><Button onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create record'} <ArrowRight size={16}/></Button></div></form>;
}
function EntityPage({ title, description, query, records, fields, columns, createRecord, updateRecord, deleteRecord, invalidate, emptyMessage, saving }: any) {
  const [editing, setEditing] = useState<any>(false); const [search, setSearch] = useState('');
  const toast = useToast(); const qc = useQueryClient();
  const filtered = records.filter((r: any) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
  const commit = async (data: any) => { try { if (editing && editing !== true) await updateRecord(editing.id, data); else await createRecord(data); await qc.invalidateQueries({ queryKey: invalidate }); setEditing(false); toast(editing && editing !== true ? 'Changes saved.' : 'Record created.'); } catch { toast('The record could not be saved. Check the fields and retry.', 'error'); } };
  const remove = async (record: any) => { if (!window.confirm(`Permanently delete “${record.name || record.department || label(record.service_type) || 'this record'}”? This action cannot be undone.`)) return; try { await deleteRecord(record.id); await qc.invalidateQueries({ queryKey: invalidate }); toast('Record deleted.'); } catch { toast('Could not delete this record.', 'error'); } };
  return <><PageHeading title={title} detail={description} action={<Button variant="primary" onClick={() => setEditing(true)}><Plus size={17}/> Add {title.slice(0, -1).toLowerCase()}</Button>}/>
    <div className="list-toolbar"><label className="search-box"><Search size={16}/><input aria-label={`Search ${title.toLowerCase()}`} value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`}/></label><span className="record-count">{query.isLoading ? 'Loading…' : `${filtered.length} records`}</span></div>
    <Panel className="table-panel"><QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()} empty={!filtered.length} emptyTitle={search ? 'Try a different search.' : emptyMessage}><div className="table-wrap"><table><thead><tr>{columns.map((c: any) => <th key={c.label}>{c.label}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((r: any) => <tr key={r.id}>{columns.map((c: any) => <td key={c.label}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}<td><div className="row-actions"><button aria-label="Edit record" className="icon-button" onClick={() => setEditing(r)}><Pencil size={15}/></button><button aria-label="Delete record" className="icon-button danger-hover" onClick={() => remove(r)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div></QueryState></Panel>
    {editing !== false && <Modal title={editing === true ? `Add ${title.slice(0,-1).toLowerCase()}` : `Edit ${title.slice(0,-1).toLowerCase()}`} close={() => setEditing(false)}><EntityForm fields={fields} initial={editing === true ? null : editing} busy={saving} onSubmit={commit} onCancel={() => setEditing(false)}/></Modal>}
  </>;
}
function Projects() {
  const q = useGetProjects({ page: 1, page_size: 100 }); const wards = useGetWards({ page_size: 100 }); const create = useCreateProject(); const update = useUpdateProject(); const del = useDeleteProject();
  const wardOptions = (wards.data?.data || []).map((w: Ward) => ({ value: w.id, label: w.name }));
  const fields: FieldDef[] = [{ name: 'name', label: 'Project name', required: true }, { name: 'department', label: 'Department', required: true }, { name: 'ward_id', label: 'Ward', options: [{ value: '', label: 'No ward assigned' }, ...wardOptions] }, { name: 'budget', label: 'Budget (₹)', numeric: true, required: true, min: 0 }, { name: 'amount_spent', label: 'Amount spent (₹)', numeric: true, required: true, min: 0 }, { name: 'progress', label: 'Progress (%)', numeric: true, required: true, min: 0, max: 100 }, { name: 'status', label: 'Status', options: ['planned','active','on_hold','completed','cancelled'] }, { name: 'deadline', label: 'Deadline', type: 'date' }, { name: 'description', label: 'Description' }];
  return <EntityPage title="Projects" description="Track delivery, progress and approved project budgets." query={q} records={q.data?.data || []} fields={fields} createRecord={create.mutateAsync} updateRecord={(id: string, data: any) => update.mutateAsync({ id, data })} deleteRecord={(id: string) => del.mutateAsync({ id })} invalidate={getGetProjectsQueryKey({ page: 1, page_size: 100 })} saving={create.isPending || update.isPending} emptyMessage="Create a project to track municipal delivery." columns={[{ label: 'Project', key: 'name', render: (r: Project) => <><b className="table-primary">{r.name}</b><small className="table-secondary">{r.department}</small></> }, { label: 'Ward', key: 'ward_name' }, { label: 'Budget', render: (r: Project) => money(r.budget, 'INR') }, { label: 'Progress', render: (r: Project) => <div className="table-progress"><span><i style={{ width: `${r.progress}%` }}/></span><b>{r.progress}%</b></div> }, { label: 'Status', render: (r: Project) => <Badge value={r.status}/> }, { label: 'Deadline', render: (r: Project) => date(r.deadline) }]}/>;
}
function Resources() {
  const q = useGetResources({ page: 1, page_size: 100 }); const create = useCreateResource(); const update = useUpdateResource(); const del = useDeleteResource(); const rows = q.data?.data || [];
  const fields: FieldDef[] = [{ name: 'department', label: 'Department', required: true }, { name: 'name', label: 'Allocation name', required: true }, { name: 'allocated_amount', label: 'Allocated amount', numeric: true, required: true, min: 0 }, { name: 'spent_amount', label: 'Spent amount', numeric: true, required: true, min: 0 }, { name: 'year', label: 'Fiscal year', numeric: true, required: true, min: 2000, max: 2200 }, { name: 'currency_code', label: 'Currency', required: true, options: [{ value: 'INR', label: '₹ INR — Indian Rupee' }, { value: 'USD', label: '$ USD — US Dollar' }, { value: 'EUR', label: '€ EUR — Euro' }, { value: 'GBP', label: '£ GBP — British Pound' }] }];
  return <><div className="ledger-summary">{rows.length > 0 && <div><span>Current allocation</span><b>{money(rows.reduce((n, r) => n + r.allocated_amount, 0), rows[0]?.currency_code)}</b></div>}{rows.length > 0 && <div><span>Committed spend</span><b>{money(rows.reduce((n, r) => n + r.spent_amount, 0), rows[0]?.currency_code)}</b></div>}{rows.length > 0 && <div><span>Available balance</span><b>{money(rows.reduce((n, r) => n + r.remaining_amount, 0), rows[0]?.currency_code)}</b></div>}</div>
    <EntityPage title="Resources" description="Maintain budget allocations and available balances by department." query={q} records={rows} fields={fields} createRecord={create.mutateAsync} updateRecord={(id: string, data: any) => update.mutateAsync({ id, data })} deleteRecord={(id: string) => del.mutateAsync({ id })} invalidate={getGetResourcesQueryKey({ page: 1, page_size: 100 })} saving={create.isPending || update.isPending} emptyMessage="Add an allocation to establish a visible balance." columns={[{ label: 'Allocation', key: 'name', render: (r: Resource) => <><b className="table-primary">{r.name}</b><small className="table-secondary">{r.department} · FY {r.year}</small></> }, { label: 'Allocated', render: (r: Resource) => money(r.allocated_amount, r.currency_code) }, { label: 'Spent', render: (r: Resource) => money(r.spent_amount, r.currency_code) }, { label: 'Remaining', render: (r: Resource) => <b className="balance-value">{money(r.remaining_amount, r.currency_code)}</b> }, { label: 'Utilization', render: (r: Resource) => <div className="table-progress"><span><i style={{ width: `${r.allocated_amount ? Math.min(100, r.spent_amount / r.allocated_amount * 100) : 0}%` }}/></span><b>{r.allocated_amount ? Math.round(r.spent_amount / r.allocated_amount * 100) : 0}%</b></div> }]}/>
  </>;
}
function Services() {
  const q = useGetServices({ page: 1, page_size: 100 }); const wards = useGetWards({ page_size: 100 }); const create = useCreateService(); const update = useUpdateService(); const del = useDeleteService();
  const wardOpts = (wards.data?.data || []).map((w: Ward) => ({ value: w.id, label: w.name }));
  const wardOptsWithPlaceholder = wardOpts.length > 0
    ? wardOpts
    : [{ value: '', label: wards.isLoading ? 'Loading wards…' : 'No wards yet — create one first' }];
  const fields: FieldDef[] = [{ name: 'ward_id', label: 'Ward', options: wardOptsWithPlaceholder, required: true }, { name: 'service_type', label: 'Service type', options: ['water','waste_management','roads','street_lights','healthcare'] }, { name: 'coverage', label: 'Coverage (%)', numeric: true, required: true, min: 0, max: 100 }, { name: 'satisfaction', label: 'Satisfaction (%)', numeric: true, required: true, min: 0, max: 100 }, { name: 'status', label: 'Status', options: ['good','needs_attention','critical','unavailable'] }, { name: 'reporting_period', label: 'Reporting period', required: true, type: 'date' }];
  return <EntityPage title="Services" description="Measure essential service coverage, satisfaction and condition." query={q} records={q.data?.data || []} fields={fields} createRecord={create.mutateAsync} updateRecord={(id: string, data: any) => update.mutateAsync({ id, data })} deleteRecord={(id: string) => del.mutateAsync({ id })} invalidate={getGetServicesQueryKey({ page: 1, page_size: 100 })} saving={create.isPending || update.isPending} emptyMessage="No service records yet. Add a ward service assessment." columns={[{ label: 'Service', render: (r: Service) => <><b className="table-primary">{label(r.service_type)}</b><small className="table-secondary">{r.ward_name || 'Ward not named'}</small></> }, { label: 'Coverage', render: (r: Service) => <div className="table-progress"><span><i style={{ width: `${r.coverage}%` }}/></span><b>{r.coverage}%</b></div> }, { label: 'Satisfaction', render: (r: Service) => `${r.satisfaction}%` }, { label: 'Status', render: (r: Service) => <Badge value={r.status}/> }, { label: 'Period', key: 'reporting_period' }]}/>;
}
function Wards() {
  const q = useGetWards({ page: 1, page_size: 100 }); const create = useCreateWard(); const update = useUpdateWard(); const del = useDeleteWard();
  const fields: FieldDef[] = [{ name: 'name', label: 'Ward name', required: true }, { name: 'code', label: 'Ward code' }, { name: 'description', label: 'Description' }];
  return <EntityPage title="Wards" description="Manage the geographic units that organize municipal operations." query={q} records={q.data?.data || []} fields={fields} createRecord={create.mutateAsync} updateRecord={(id: string, data: any) => update.mutateAsync({ id, data })} deleteRecord={(id: string) => del.mutateAsync({ id })} invalidate={getGetWardsQueryKey({ page: 1, page_size: 100 })} saving={create.isPending || update.isPending} emptyMessage="Add wards to organize services and constituent concerns." columns={[{ label: 'Ward', render: (r: Ward) => <><b className="table-primary">{r.name}</b><small className="table-secondary">{r.code || 'No ward code'}</small></> }, { label: 'Description', key: 'description' }, { label: 'Added', render: (r: Ward) => date(r.created_at) }]}/>;
}

function Insights() {
  const [status, setStatus] = useState(''); const params = useMemo(() => ({ page: 1, page_size: 100, ...(status ? { status: status as any } : {}) }), [status]);
  const q = useGetAiInsights(params); const generate = useGenerateAiInsights(); const update = useUpdateAiInsight(); const qc = useQueryClient(); const toast = useToast(); const data = q.data?.data || [];
  const mark = async (id: string, value: 'acknowledged' | 'dismissed') => { try { await update.mutateAsync({ id, data: { status: value } }); await qc.invalidateQueries({ queryKey: getGetAiInsightsQueryKey(params) }); toast(value === 'acknowledged' ? 'Insight acknowledged.' : 'Insight dismissed.'); } catch { toast('Insight status could not be changed.', 'error'); } };
  const generateNow = async () => { try { await generate.mutateAsync({ data: {} }); await qc.invalidateQueries({ queryKey: getGetAiInsightsQueryKey(params) }); toast('Insights refreshed from available operational data.'); } catch { toast('Insights could not be generated. Try again later.', 'error'); } };
  return <><PageHeading title="AI insights" detail="Review evidence-based recommendations. These support—not replace—officer judgement." action={<Button variant="primary" onClick={generateNow} disabled={generate.isPending}><Sparkles size={16}/>{generate.isPending ? 'Generating…' : 'Generate insights'}</Button>}/>
    <div className="insight-toolbar"><div className="insight-intro"><div className="ai-round"><Sparkles size={18}/></div><div><b>Decision support, grounded in your records</b><span>Recommendations link back to signals in municipal operations.</span></div></div><SelectField label="" name="insight-status" value={status} onChange={(e: any) => setStatus(e.target.value)} options={[{ value: '', label: 'All insights' }, ...['new','acknowledged','dismissed'].map(x => ({ value: x, label: label(x) }))]}/></div>
    <QueryState loading={q.isLoading} error={q.isError} retry={() => q.refetch()} empty={!data.length} emptyTitle="Generated insights will appear here when available."><div className="insights-list">{data.map(insight => <article className="insight-card" key={insight.id}><div className="insight-card-head"><div className="insight-kind"><span className="insight-kind-icon"><Lightbulb size={17}/></span><span>{label(insight.kind)}</span><Badge value={insight.status}/></div><small>{date(insight.created_at)}</small></div><h2>{insight.title}</h2><p className="insight-summary">{insight.summary}</p><div className="recommendation"><span>RECOMMENDED ACTION</span><p>{insight.recommended_action}</p></div>{!!insight.payload?.length && <div className="evidence-list"><b>Evidence and signals</b>{insight.payload.map((p, i) => <div className="evidence-row" key={`${insight.id}-${i}`}><Badge value={p.severity}/><div><b>{p.issue}</b><p>{p.evidence?.join(' · ')}</p><small>{p.recommendation}</small></div></div>)}</div>}<div className="insight-footer"><span>{insight.model} · {insight.prompt_version}</span><div>{insight.status === 'new' && <><Button onClick={() => mark(insight.id, 'dismissed')}>Dismiss</Button><Button variant="primary" onClick={() => mark(insight.id, 'acknowledged')}><Check size={15}/> Acknowledge</Button></>}{insight.status !== 'new' && <Badge value={insight.status}/>}</div></div></article>)}</div></QueryState>
  </>;
}

function ProfilePage() {
  const q = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } }); const update = useUpdateProfile(); const qc = useQueryClient(); const toast = useToast(); const profile: any = q.data;
  const submit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const data = Object.fromEntries(fd.entries()); try { await update.mutateAsync({ data: { full_name: String(data.full_name), department: String(data.department) || null, title: String(data.title) || null, timezone: String(data.timezone) } }); await qc.invalidateQueries({ queryKey: getGetProfileQueryKey() }); await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); toast('Profile updated.'); } catch { toast('Profile could not be updated.', 'error'); } };
  return <><PageHeading title="Profile settings" detail="Keep your officer details current for your team."/>
    <QueryState loading={q.isLoading} error={q.isError} retry={() => q.refetch()} empty={!profile}><div className="profile-layout"><Panel className="profile-card"><div className="profile-avatar">{profile?.full_name?.split(' ').map((x: string) => x[0]).slice(0,2).join('').toUpperCase()}</div><h2>{profile?.full_name}</h2><p>{profile?.title || 'Municipal officer'}</p><span className="profile-dept">{profile?.department || 'Department not set'}</span><div className="profile-secure"><ShieldCheck size={17}/><span>Verified officer session</span></div></Panel><Panel className="profile-edit" title="Officer information" subtitle="These details help identify your work across CivicPulse."><form className="form-stack" onSubmit={submit}><Field name="full_name" label="Full name" required defaultValue={profile?.full_name}/><Field name="email" label="Work email" type="email" defaultValue={profile?.email} disabled/><div className="form-grid"><Field name="title" label="Title" defaultValue={profile?.title || ''}/><Field name="department" label="Department" defaultValue={profile?.department || ''}/></div><SelectField name="timezone" label="Time zone" defaultValue={profile?.timezone || 'UTC'} options={['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Asia/Kolkata'].map(x => ({ value: x, label: x.replace('_',' ') }))}/><div className="modal-actions"><Button type="submit" variant="primary" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save profile'} <Check size={16}/></Button></div></form></Panel></div></QueryState>
  </>;
}
function NotFound() { return <div className="not-found"><span className="eyebrow">404 / NOT FOUND</span><h1>This page isn’t on the map.</h1><p>The page may have moved, or the address may be incorrect.</p><Link to="/dashboard" className="button primary"><ArrowLeft size={16}/> Return to dashboard</Link></div>; }

export default App;
