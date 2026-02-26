import type { Epic, Story, ParsedPlan, Task } from './types';

export function parsePlanningMd(content: string): ParsedPlan {
  const lines = content.split('\n');
  const epics: Epic[] = [];
  const tasks: Task[] = [];

  let currentEpic: Epic | null = null;
  let currentStory: Story | null = null;
  let inTasksSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd(); // handle \r\n on Windows

    // Stop at summary/sprint planning sections
    if (/^## Özet Tablo/.test(line) || /^## Önerilen Sprint/.test(line)) break;

    // EPIC: ## 🟣 EPIC-X · Title
    const epicMatch = line.match(/^## .* (EPIC-\d+) . (.+)$/);
    if (epicMatch) {
      currentEpic = { id: epicMatch[1], title: epicMatch[2].trim(), description: '', stories: [] };
      epics.push(currentEpic);
      currentStory = null;
      inTasksSection = false;
      continue;
    }

    // Epic description: > *Description*
    if (currentEpic && !currentStory) {
      const descMatch = line.match(/^> \*(.+)\*$/);
      if (descMatch) {
        currentEpic.description = descMatch[1].trim();
        continue;
      }
    }

    // Tasks section marker: ## 🟡 TASK'LAR (anything with TASK)
    if (/^## .* TASK/.test(line)) {
      inTasksSection = true;
      currentStory = null;
      continue;
    }

    // STORY: ### 🔵 STORY-X.Y · Title
    if (!inTasksSection) {
      const storyMatch = line.match(/^### .* (STORY-(\d+)\.\d+) . (.+)$/);
      if (storyMatch) {
        const parentEpic = epics.find(e => e.id === `EPIC-${storyMatch[2]}`);
        currentStory = {
          id: storyMatch[1],
          title: storyMatch[3].trim(),
          description: '',
          storyPoints: 0,
          subtasks: [],
        };
        if (parentEpic) parentEpic.stories.push(currentStory);
        continue;
      }
    }

    // Story user-story description: **"..."**
    if (currentStory && !inTasksSection) {
      const userStoryMatch = line.match(/^\*\*"(.+)"\*\*$/);
      if (userStoryMatch) {
        currentStory.description = userStoryMatch[1].trim();
        continue;
      }
    }

    // Subtask rows inside a story table: | ⬜ Title | SP |
    if (currentStory && !inTasksSection) {
      if (/\*\*Toplam\*\*/.test(line)) {
        // Capture story total SP from: | **Toplam** | **12** |
        const totalMatch = line.match(/\*\*(\d+)\*\*/g);
        if (totalMatch && totalMatch.length >= 1) {
          const num = totalMatch[totalMatch.length - 1].replace(/\*\*/g, '');
          currentStory.storyPoints = parseInt(num, 10);
        }
        continue;
      }
      if (/^\|[- ]+\|/.test(line) || /^\| Subtask/.test(line)) continue;

      const subtaskMatch = line.match(/^\| ⬜ (.+?) \| (\d+) \|/);
      if (subtaskMatch) {
        currentStory.subtasks.push({
          title: subtaskMatch[1].trim().replace(/`/g, ''),
          storyPoints: parseInt(subtaskMatch[2], 10),
        });
        continue;
      }
    }

    // Standalone Task: | TASK-X | Title | SP | Notes |
    if (inTasksSection) {
      const taskMatch = line.match(/^\| (TASK-\d+) \| (.+?) \| (\d+) \|(.*)/);
      if (taskMatch) {
        const notes = taskMatch[4].trim().replace(/^\|/, '').replace(/\|$/, '').trim();
        tasks.push({
          id: taskMatch[1].trim(),
          title: `${taskMatch[1].trim()}: ${taskMatch[2].trim()}`,
          description: notes ? `Notes: ${notes}` : '',
          storyPoints: parseInt(taskMatch[3], 10),
        });
      }
    }
  }

  return { epics, tasks };
}

export function countIssues(plan: ParsedPlan) {
  const stories = plan.epics.reduce((s, e) => s + e.stories.length, 0);
  const subtasks = plan.epics.reduce(
    (s, e) => s + e.stories.reduce((ss, st) => ss + st.subtasks.length, 0),
    0
  );
  return {
    epics: plan.epics.length,
    stories,
    subtasks,
    tasks: plan.tasks.length,
    total: plan.epics.length + stories + subtasks + plan.tasks.length,
  };
}
