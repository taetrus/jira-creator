import { useState, useRef, useCallback } from 'react';
import type { Config, ParsedPlan, LogEntry, JiraField } from './types';
import { DEFAULT_CONFIG } from './types';
import { parsePlanningMd, countIssues } from './parser';
import { testConnection, discoverFields, createIssue } from './jira';
import './App.css';

type Step = 'config' | 'parse' | 'create';

function loadConfig(): Config {
  try {
    const saved = localStorage.getItem('jira-creator-config');
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

export default function App() {
  const [step, setStep] = useState<Step>('config');
  const [config, setConfig] = useState<Config>(loadConfig);
  const [mdText, setMdText] = useState('');
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [connStatus, setConnStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [connMsg, setConnMsg] = useState('');
  const [fields, setFields] = useState<JiraField[]>([]);
  const [showFields, setShowFields] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const saveConfig = (c: Config) => {
    setConfig(c);
    localStorage.setItem('jira-creator-config', JSON.stringify(c));
  };

  const addLog = useCallback((status: LogEntry['status'], message: string) => {
    setLog(prev => [...prev, { status, message }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // ── Config step ──────────────────────────────────────────────────────────────

  async function handleTestConnection() {
    setConnStatus('idle');
    setConnMsg('Testing...');
    try {
      const me = await testConnection(config);
      setConnStatus('ok');
      setConnMsg(`Connected as: ${me.displayName}`);
    } catch (e) {
      setConnStatus('err');
      setConnMsg(String(e));
    }
  }

  async function handleDiscoverFields() {
    setConnMsg('Discovering fields...');
    try {
      const found = await discoverFields(config);
      setFields(found.sort((a, b) => a.name.localeCompare(b.name)));
      setShowFields(true);
      setConnMsg('');
    } catch (e) {
      setConnStatus('err');
      setConnMsg(String(e));
    }
  }

  function applyField(fieldId: string) {
    const name = fields.find(f => f.id === fieldId)?.name?.toLowerCase() ?? '';
    const updates: Partial<Config> = {};
    if (name.includes('epic name')) updates.epicNameField = fieldId;
    else if (name.includes('epic link')) updates.epicLinkField = fieldId;
    else if (name.includes('story point') || name.includes('estimate')) updates.spField = fieldId;
    if (Object.keys(updates).length > 0) saveConfig({ ...config, ...updates });
  }

  // ── Parse step ───────────────────────────────────────────────────────────────

  function handleFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setMdText(ev.target?.result as string ?? '');
    reader.readAsText(file, 'utf-8');
  }

  function handleParse() {
    if (!mdText.trim()) return;
    const parsed = parsePlanningMd(mdText);
    setPlan(parsed);
  }

  // ── Create step ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!plan) return;
    setRunning(true);
    setLog([]);
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      if (!dryRun) {
        addLog('info', 'Testing connection...');
        try {
          const me = await testConnection(config);
          addLog('ok', `Connected as: ${me.displayName}`);
        } catch (e) {
          addLog('err', `Connection failed: ${e}`);
          setRunning(false);
          return;
        }
      }

      // Phase 1: Epics
      addLog('info', '── Phase 1/4: Epics ──');
      for (const epic of plan.epics) {
        const summary = `${epic.id}: ${epic.title}`;
        if (dryRun) {
          addLog('dry', `[Epic] ${summary}`);
          epic.jiraKey = 'DRY-EPIC';
          continue;
        }
        try {
          const res = await createIssue(config, config.typeEpic, summary, {
            description: epic.description,
            epicName: summary,
          });
          epic.jiraKey = res.key;
          addLog('ok', `Epic -> ${res.key}  [${epic.id}] ${epic.title}`);
          await delay(300);
        } catch (e) {
          addLog('err', `Epic failed [${epic.id}]: ${e}`);
        }
      }

      // Phase 2: Stories
      addLog('info', '── Phase 2/4: Stories ──');
      for (const epic of plan.epics) {
        for (const story of epic.stories) {
          const summary = `${story.id}: ${story.title}`;
          if (dryRun) {
            addLog('dry', `  [Story] ${summary} (${story.storyPoints}SP)  epic=${epic.jiraKey}`);
            story.jiraKey = 'DRY-STORY';
            continue;
          }
          try {
            const res = await createIssue(config, config.typeStory, summary, {
              description: story.description,
              storyPoints: story.storyPoints,
              epicKey: epic.jiraKey,
            });
            story.jiraKey = res.key;
            addLog('ok', `Story -> ${res.key}  [${story.id}] ${story.title}`);
            await delay(300);
          } catch (e) {
            addLog('err', `Story failed [${story.id}]: ${e}`);
          }
        }
      }

      // Phase 3: Subtasks
      addLog('info', '── Phase 3/4: Subtasks ──');
      for (const epic of plan.epics) {
        for (const story of epic.stories) {
          for (const sub of story.subtasks) {
            if (dryRun) {
              addLog('dry', `    [Subtask] ${sub.title} (${sub.storyPoints}SP)  parent=${story.jiraKey}`);
              sub.jiraKey = 'DRY-SUB';
              continue;
            }
            if (!story.jiraKey) {
              addLog('skip', `    Skipped subtask (no parent key): ${sub.title}`);
              continue;
            }
            try {
              const res = await createIssue(config, config.typeSubtask, sub.title, {
                storyPoints: sub.storyPoints,
                parentKey: story.jiraKey,
              });
              sub.jiraKey = res.key;
              addLog('ok', `  Subtask -> ${res.key}  ${sub.title}`);
              await delay(300);
            } catch (e) {
              addLog('err', `  Subtask failed [${sub.title}]: ${e}`);
            }
          }
        }
      }

      // Phase 4: Tasks
      addLog('info', '── Phase 4/4: Tasks ──');
      for (const task of plan.tasks) {
        if (dryRun) {
          addLog('dry', `[Task] ${task.title} (${task.storyPoints}SP)`);
          task.jiraKey = 'DRY-TASK';
          continue;
        }
        try {
          const res = await createIssue(config, config.typeTask, task.title, {
            description: task.description,
            storyPoints: task.storyPoints,
          });
          task.jiraKey = res.key;
          addLog('ok', `Task -> ${res.key}  ${task.title}`);
          await delay(300);
        } catch (e) {
          addLog('err', `Task failed [${task.id}]: ${e}`);
        }
      }

      const counts = countIssues(plan);
      const errors = log.filter(l => l.status === 'err').length;
      addLog('info', `── Done: ${counts.total} issues${dryRun ? ' (dry run)' : ''}, ${errors} errors ──`);
    } finally {
      setRunning(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const counts = plan ? countIssues(plan) : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Jira Issue Creator</h1>
        <nav className="tabs">
          {(['config', 'parse', 'create'] as Step[]).map(s => (
            <button
              key={s}
              className={`tab ${step === s ? 'active' : ''}`}
              onClick={() => setStep(s)}
            >
              {s === 'config' ? '1. Config' : s === 'parse' ? '2. Parse' : '3. Create'}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">

        {/* ── CONFIG ───────────────────────────────────────────────────────── */}
        {step === 'config' && (
          <div className="section">
            <h2>Jira Configuration</h2>
            <div className="form-grid">
              <label>Base URL
                <input value={config.baseUrl} onChange={e => saveConfig({ ...config, baseUrl: e.target.value })} placeholder="https://jira.company.com" />
              </label>
              <label>Auth Method
                <select value={config.authMethod} onChange={e => saveConfig({ ...config, authMethod: e.target.value as 'Basic' | 'Bearer' })}>
                  <option value="Basic">Basic (username + token)</option>
                  <option value="Bearer">Bearer (PAT — Jira 8.14+)</option>
                </select>
              </label>
              <label>Username
                <input value={config.username} onChange={e => saveConfig({ ...config, username: e.target.value })} placeholder="your-username" />
              </label>
              <label>Token / Password
                <input type="password" value={config.token} onChange={e => saveConfig({ ...config, token: e.target.value })} placeholder="api-token-or-password" />
              </label>
              <label>Project Key
                <input value={config.projectKey} onChange={e => saveConfig({ ...config, projectKey: e.target.value })} placeholder="PROJ" />
              </label>
              <label>Label
                <input value={config.label} onChange={e => saveConfig({ ...config, label: e.target.value })} placeholder="EATL" />
              </label>
            </div>

            <h3>Custom Fields <span className="hint">(run Discover to auto-fill)</span></h3>
            <div className="form-grid">
              <label>Epic Name Field
                <input value={config.epicNameField} onChange={e => saveConfig({ ...config, epicNameField: e.target.value })} />
              </label>
              <label>Epic Link Field
                <input value={config.epicLinkField} onChange={e => saveConfig({ ...config, epicLinkField: e.target.value })} />
              </label>
              <label>Story Points Field
                <input value={config.spField} onChange={e => saveConfig({ ...config, spField: e.target.value })} />
              </label>
            </div>

            <h3>Issue Type Names</h3>
            <div className="form-grid">
              {(['typeEpic', 'typeStory', 'typeSubtask', 'typeTask'] as const).map(k => (
                <label key={k}>{k.replace('type', '')}
                  <input value={config[k]} onChange={e => saveConfig({ ...config, [k]: e.target.value })} />
                </label>
              ))}
            </div>

            <div className="btn-row">
              <button onClick={handleTestConnection}>Test Connection</button>
              <button onClick={handleDiscoverFields}>Discover Fields</button>
              <button className="primary" onClick={() => setStep('parse')}>Next: Parse →</button>
            </div>

            {connMsg && (
              <div className={`status-msg ${connStatus}`}>{connMsg}</div>
            )}

            {showFields && fields.length > 0 && (
              <div className="fields-table-wrap">
                <h3>Discovered Fields <span className="hint">— click a row to auto-fill above</span></h3>
                <table className="fields-table">
                  <thead><tr><th>Name</th><th>ID</th><th>Type</th></tr></thead>
                  <tbody>
                    {fields.map(f => (
                      <tr key={f.id} onClick={() => applyField(f.id)} title="Click to apply">
                        <td>{f.name}</td>
                        <td><code>{f.id}</code></td>
                        <td>{f.schema?.type ?? '?'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PARSE ────────────────────────────────────────────────────────── */}
        {step === 'parse' && (
          <div className="section">
            <h2>Load PLANNING.md</h2>
            <div className="file-area">
              <button onClick={() => fileInputRef.current?.click()}>Upload file</button>
              <input ref={fileInputRef} type="file" accept=".md,text/markdown,text/plain" style={{ display: 'none' }} onChange={handleFileLoad} />
              <span className="hint"> or paste below</span>
            </div>
            <textarea
              className="md-input"
              value={mdText}
              onChange={e => setMdText(e.target.value)}
              placeholder="Paste your PLANNING.md content here..."
              rows={12}
            />
            <div className="btn-row">
              <button className="primary" onClick={handleParse} disabled={!mdText.trim()}>Parse</button>
            </div>

            {plan && counts && (
              <div className="preview">
                <div className="counts">
                  <span>{counts.epics} epics</span>
                  <span>{counts.stories} stories</span>
                  <span>{counts.subtasks} subtasks</span>
                  <span>{counts.tasks} tasks</span>
                  <strong>{counts.total} total</strong>
                </div>
                <div className="tree">
                  {plan.epics.map(epic => (
                    <details key={epic.id} open>
                      <summary className="tree-epic">🟣 {epic.id} · {epic.title}</summary>
                      {epic.stories.map(story => (
                        <details key={story.id} className="tree-story-wrap">
                          <summary className="tree-story">🔵 {story.id} · {story.title} ({story.storyPoints}SP)</summary>
                          <ul className="tree-subtasks">
                            {story.subtasks.map((sub, i) => (
                              <li key={i}>⬜ {sub.title} <span className="sp">{sub.storyPoints}SP</span></li>
                            ))}
                          </ul>
                        </details>
                      ))}
                    </details>
                  ))}
                  {plan.tasks.length > 0 && (
                    <details open>
                      <summary className="tree-epic">🟡 Tasks ({plan.tasks.length})</summary>
                      <ul className="tree-subtasks">
                        {plan.tasks.map(t => (
                          <li key={t.id}>{t.title} <span className="sp">{t.storyPoints}SP</span></li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="btn-row">
                  <button className="primary" onClick={() => setStep('create')}>Next: Create →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CREATE ───────────────────────────────────────────────────────── */}
        {step === 'create' && (
          <div className="section">
            <h2>Create Issues</h2>
            {!plan || !counts ? (
              <p>Go to <button className="link-btn" onClick={() => setStep('parse')}>Parse</button> first.</p>
            ) : (
              <>
                <div className="counts">
                  <span>{counts.epics} epics</span>
                  <span>{counts.stories} stories</span>
                  <span>{counts.subtasks} subtasks</span>
                  <span>{counts.tasks} tasks</span>
                  <strong>{counts.total} total</strong>
                </div>
                <div className="btn-row">
                  <label className="dry-run-label">
                    <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
                    Dry run (no API calls)
                  </label>
                  <button className="primary" onClick={handleCreate} disabled={running}>
                    {running ? 'Creating...' : dryRun ? 'Dry Run' : 'Create All Issues'}
                  </button>
                </div>
                {log.length > 0 && (
                  <div className="log">
                    {log.map((entry, i) => (
                      <div key={i} className={`log-line ${entry.status}`}>
                        <span className="log-tag">{entry.status.toUpperCase()}</span>
                        {entry.message}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
