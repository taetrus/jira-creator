import type { Config, JiraField } from './types';

function authHeader(config: Config): string {
  if (config.authMethod === 'Bearer') return `Bearer ${config.token}`;
  return `Basic ${btoa(`${config.username}:${config.token}`)}`;
}

async function request<T>(config: Config, method: string, endpoint: string, body?: object): Promise<T> {
  const res = await fetch(`${config.baseUrl}/rest/api/2/${endpoint}`, {
    method,
    headers: {
      Authorization: authHeader(config),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}${detail ? ': ' + detail.slice(0, 300) : ''}`);
  }
  return res.json() as Promise<T>;
}

export async function testConnection(config: Config): Promise<{ displayName: string }> {
  return request(config, 'GET', 'myself');
}

export async function discoverFields(config: Config): Promise<JiraField[]> {
  const all = await request<JiraField[]>(config, 'GET', 'field');
  const keywords = ['epic', 'story', 'point', 'estimate', 'sprint', 'rank', 'parent'];
  return all.filter(f => {
    const name = f.name.toLowerCase();
    return keywords.some(k => name.includes(k));
  });
}

export async function createIssue(
  config: Config,
  issueType: string,
  summary: string,
  opts: {
    description?: string;
    storyPoints?: number;
    epicKey?: string;
    parentKey?: string;
    epicName?: string;
  }
): Promise<{ key: string }> {
  const fields: Record<string, unknown> = {
    project: { key: config.projectKey },
    summary,
    issuetype: { name: issueType },
    labels: config.label ? [config.label] : [],
  };

  if (opts.description) fields.description = opts.description;
  if (opts.storyPoints && opts.storyPoints > 0 && config.spField)
    fields[config.spField] = opts.storyPoints;
  if (issueType === config.typeEpic && opts.epicName && config.epicNameField)
    fields[config.epicNameField] = opts.epicName;
  if (issueType === config.typeStory && opts.epicKey && config.epicLinkField)
    fields[config.epicLinkField] = opts.epicKey;
  if (issueType === config.typeSubtask && opts.parentKey)
    fields.parent = { key: opts.parentKey };

  return request(config, 'POST', 'issue', { fields });
}
