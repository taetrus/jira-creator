export interface Config {
  baseUrl: string;
  username: string;
  token: string;
  authMethod: 'Basic' | 'Bearer';
  projectKey: string;
  label: string;
  epicNameField: string;
  epicLinkField: string;
  spField: string;
  typeEpic: string;
  typeStory: string;
  typeSubtask: string;
  typeTask: string;
}

export const DEFAULT_CONFIG: Config = {
  baseUrl: 'https://jira.yourcompany.com',
  username: '',
  token: '',
  authMethod: 'Basic',
  projectKey: 'PROJ',
  label: 'EATL',
  epicNameField: 'customfield_10011',
  epicLinkField: 'customfield_10014',
  spField: 'customfield_10016',
  typeEpic: 'Epic',
  typeStory: 'Story',
  typeSubtask: 'Sub-task',
  typeTask: 'Task',
};

export interface Subtask {
  title: string;
  storyPoints: number;
  jiraKey?: string;
}

export interface Story {
  id: string;
  title: string;
  description: string;
  storyPoints: number;
  subtasks: Subtask[];
  jiraKey?: string;
}

export interface Epic {
  id: string;
  title: string;
  description: string;
  stories: Story[];
  jiraKey?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  storyPoints: number;
  jiraKey?: string;
}

export interface ParsedPlan {
  epics: Epic[];
  tasks: Task[];
}

export interface LogEntry {
  status: 'ok' | 'err' | 'info' | 'skip' | 'dry';
  message: string;
}

export interface JiraField {
  id: string;
  name: string;
  schema?: { type: string };
}
