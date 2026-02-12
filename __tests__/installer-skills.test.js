const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { installFiles, removeFiles } = require('../src/installer');

describe('skills as folders', () => {
  test('installFiles installs skills as folders in workspace', async () => {
    const tmp = path.join(os.tmpdir(), `acp-skills-${Date.now()}`);
    await fs.ensureDir(tmp);

    const skillContent = `---
name: test-skill
description: A test skill for demonstration
---

# Test Skill

This is a test skill.`;

    const items = [
      { id: 'test-skill', name: 'Test Skill', content: skillContent }
    ];
    
    const dest = await installFiles({ items, type: 'skills', target: 'workspace', workspaceDir: tmp });
    
    // Verify the destination is .github/skills
    expect(dest).toBe(path.join(tmp, '.github', 'skills'));
    expect(await fs.pathExists(dest)).toBe(true);
    
    // Verify the skill folder was created
    const skillFolder = path.join(dest, 'test-skill');
    expect(await fs.pathExists(skillFolder)).toBe(true);
    expect((await fs.stat(skillFolder)).isDirectory()).toBe(true);
    
    // Verify SKILL.md exists in the skill folder
    const skillMdPath = path.join(skillFolder, 'SKILL.md');
    expect(await fs.pathExists(skillMdPath)).toBe(true);
    
    // Verify the content is correct
    const content = await fs.readFile(skillMdPath, 'utf8');
    expect(content).toBe(skillContent);
    
    await fs.remove(tmp);
  });

  test('installFiles installs skills as folders in user profile', async () => {
    const tmp = path.join(os.tmpdir(), `acp-skills-user-${Date.now()}`);
    await fs.ensureDir(tmp);
    const origHome = process.env.HOME;
    process.env.HOME = tmp;

    const skillContent = `---
name: user-skill
description: A user skill
---

# User Skill

This skill is for the user profile.`;

    try {
      const items = [
        { id: 'user-skill', name: 'User Skill', content: skillContent }
      ];
      
      const dest = await installFiles({ items, type: 'skills', target: 'user' });
      
      // Verify the destination is ~/.copilot/skills
      expect(dest).toBe(path.join(tmp, '.copilot', 'skills'));
      expect(await fs.pathExists(dest)).toBe(true);
      
      // Verify the skill folder was created
      const skillFolder = path.join(dest, 'user-skill');
      expect(await fs.pathExists(skillFolder)).toBe(true);
      const skillFolderStat = await fs.stat(skillFolder);
      expect(skillFolderStat.isDirectory()).toBe(true);
      
      // Verify SKILL.md exists
      const skillMdPath = path.join(skillFolder, 'SKILL.md');
      expect(await fs.pathExists(skillMdPath)).toBe(true);
      
      // Verify the content is correct
      const content = await fs.readFile(skillMdPath, 'utf8');
      expect(content).toBe(skillContent);
    } finally {
      if (origHome === undefined) delete process.env.HOME;
      else process.env.HOME = origHome;
      await fs.remove(tmp);
    }
  });

  test('installFiles handles duplicate skill IDs with repo prefixing', async () => {
    const tmp = path.join(os.tmpdir(), `acp-skills-dupe-${Date.now()}`);
    await fs.ensureDir(tmp);

    const items = [
      { id: 'shared', name: 'Shared One', repo: 'r1', content: 'Content from r1' },
      { id: 'shared', name: 'Shared Two', repo: 'r2', content: 'Content from r2' }
    ];
    
    const dest = await installFiles({ items, type: 'skills', target: 'workspace', workspaceDir: tmp });
    
    // Verify both skill folders exist with repo prefixes
    expect(await fs.pathExists(path.join(dest, 'r1-shared'))).toBe(true);
    expect(await fs.pathExists(path.join(dest, 'r2-shared'))).toBe(true);
    
    // Verify the content is different for each
    const content1 = await fs.readFile(path.join(dest, 'r1-shared', 'SKILL.md'), 'utf8');
    const content2 = await fs.readFile(path.join(dest, 'r2-shared', 'SKILL.md'), 'utf8');
    
    expect(content1).not.toBe(content2);
    expect(content1).toContain('Content from r1');
    expect(content2).toContain('Content from r2');
    
    await fs.remove(tmp);
  });

  test('removeFiles removes skill folders from workspace', async () => {
    const tmp = path.join(os.tmpdir(), `acp-skills-remove-${Date.now()}`);
    const base = path.join(tmp, '.github', 'skills');
    await fs.ensureDir(base);
    
    // Create skill folders
    const skill1Dir = path.join(base, 'skill1');
    const skill2Dir = path.join(base, 'skill2');
    await fs.ensureDir(skill1Dir);
    await fs.ensureDir(skill2Dir);
    await fs.writeFile(path.join(skill1Dir, 'SKILL.md'), 'Skill 1');
    await fs.writeFile(path.join(skill2Dir, 'SKILL.md'), 'Skill 2');

    // Remove skill1
    const removed = await removeFiles({ names: ['skill1'], type: 'skills', target: 'workspace', workspaceDir: tmp });
    
    expect(removed).toBe(1);
    expect(await fs.pathExists(skill1Dir)).toBe(false);
    expect(await fs.pathExists(skill2Dir)).toBe(true);
    
    await fs.remove(tmp);
  });

  test('removeFiles removes skill folders from user profile', async () => {
    const tmp = path.join(os.tmpdir(), `acp-skills-remove-user-${Date.now()}`);
    const origHome = process.env.HOME;
    process.env.HOME = tmp;
    
    try {
      const base = path.join(tmp, '.copilot', 'skills');
      await fs.ensureDir(base);
      
      // Create skill folders
      const skill1Dir = path.join(base, 'user-skill1');
      const skill2Dir = path.join(base, 'user-skill2');
      await fs.ensureDir(skill1Dir);
      await fs.ensureDir(skill2Dir);
      await fs.writeFile(path.join(skill1Dir, 'SKILL.md'), 'User Skill 1');
      await fs.writeFile(path.join(skill2Dir, 'SKILL.md'), 'User Skill 2');

      // Remove skill1
      const removed = await removeFiles({ names: ['user-skill1'], type: 'skills', target: 'user' });
      
      expect(removed).toBe(1);
      expect(await fs.pathExists(skill1Dir)).toBe(false);
      expect(await fs.pathExists(skill2Dir)).toBe(true);
    } finally {
      if (origHome === undefined) delete process.env.HOME;
      else process.env.HOME = origHome;
      await fs.remove(tmp);
    }
  });

  test('removeFiles handles repo-qualified skill names', async () => {
    const tmp = path.join(os.tmpdir(), `acp-skills-remove-qualified-${Date.now()}`);
    const base = path.join(tmp, '.github', 'skills');
    await fs.ensureDir(base);
    
    // Create repo-prefixed skill folders
    const skill1Dir = path.join(base, 'r1-shared');
    const skill2Dir = path.join(base, 'r2-shared');
    await fs.ensureDir(skill1Dir);
    await fs.ensureDir(skill2Dir);
    await fs.writeFile(path.join(skill1Dir, 'SKILL.md'), 'Skill from r1');
    await fs.writeFile(path.join(skill2Dir, 'SKILL.md'), 'Skill from r2');

    // Remove with repo-qualified name
    const removed = await removeFiles({ names: ['r1:shared'], type: 'skills', target: 'workspace', workspaceDir: tmp });
    
    expect(removed).toBe(1);
    expect(await fs.pathExists(skill1Dir)).toBe(false);
    expect(await fs.pathExists(skill2Dir)).toBe(true);
    
    await fs.remove(tmp);
  });

  test('installFiles copies all files in skill folder including supporting files', async () => {
    const tmp = path.join(os.tmpdir(), `acp-skills-supporting-${Date.now()}`);
    await fs.ensureDir(tmp);

    const skillContent = `---
name: complete-skill
description: A skill with supporting files
---

# Complete Skill

This skill has supporting files.`;

    const referenceContent = `# Reference Guide

This is detailed reference material.`;

    const scriptContent = `#!/bin/bash
echo "This is a script"`;

    const items = [
      {
        id: 'complete-skill',
        name: 'Complete Skill',
        folderPath: 'skills/complete-skill',
        files: [
          { path: 'skills/complete-skill/SKILL.md', url: 'http://example.com/skills/complete-skill/SKILL.md' },
          { path: 'skills/complete-skill/references/REFERENCE.md', url: 'http://example.com/skills/complete-skill/references/REFERENCE.md' },
          { path: 'skills/complete-skill/scripts/example.sh', url: 'http://example.com/skills/complete-skill/scripts/example.sh' }
        ]
      }
    ];

    // Mock axios to return file contents
    const axios = require('axios');
    const originalAxios = axios.get;
    axios.get = jest.fn((url) => {
      if (url === 'http://example.com/skills/complete-skill/SKILL.md') {
        return Promise.resolve({ data: skillContent });
      } else if (url === 'http://example.com/skills/complete-skill/references/REFERENCE.md') {
        return Promise.resolve({ data: referenceContent });
      } else if (url === 'http://example.com/skills/complete-skill/scripts/example.sh') {
        return Promise.resolve({ data: scriptContent });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    try {
      const dest = await installFiles({ items, type: 'skills', target: 'workspace', workspaceDir: tmp });

      // Verify the skill folder was created
      const skillFolder = path.join(dest, 'complete-skill');
      expect(await fs.pathExists(skillFolder)).toBe(true);

      // Verify all files exist
      expect(await fs.pathExists(path.join(skillFolder, 'SKILL.md'))).toBe(true);
      expect(await fs.pathExists(path.join(skillFolder, 'references', 'REFERENCE.md'))).toBe(true);
      expect(await fs.pathExists(path.join(skillFolder, 'scripts', 'example.sh'))).toBe(true);

      // Verify content is correct
      const skillMd = await fs.readFile(path.join(skillFolder, 'SKILL.md'), 'utf8');
      const refMd = await fs.readFile(path.join(skillFolder, 'references', 'REFERENCE.md'), 'utf8');
      const script = await fs.readFile(path.join(skillFolder, 'scripts', 'example.sh'), 'utf8');

      expect(skillMd).toContain('complete-skill');
      expect(refMd).toContain('Reference Guide');
      expect(script).toContain('This is a script');
    } finally {
      axios.get = originalAxios;
      await fs.remove(tmp);
    }
  });
});
