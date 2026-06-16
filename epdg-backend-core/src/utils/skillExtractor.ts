const SKILL_KEYWORDS: Record<string, string[]> = {
  'Programming Languages': [
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust',
    'swift', 'kotlin', 'scala', 'r', 'matlab', 'dart', 'perl', 'bash', 'shell',
  ],
  'Frontend': [
    'react', 'vue', 'angular', 'next.js', 'nuxt', 'svelte', 'html', 'css', 'sass', 'tailwind',
    'bootstrap', 'jquery', 'redux', 'webpack', 'vite', 'figma', 'responsive design',
  ],
  'Backend': [
    'node.js', 'express', 'fastapi', 'django', 'flask', 'spring', 'laravel', 'rails',
    'graphql', 'rest', 'api', 'microservices', 'websocket',
  ],
  'Databases': [
    'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite', 'supabase', 'firebase',
    'elasticsearch', 'cassandra', 'dynamodb', 'sql', 'nosql',
  ],
  'Cloud & DevOps': [
    'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'ci/cd', 'github actions',
    'jenkins', 'terraform', 'linux', 'nginx', 'railway', 'vercel', 'netlify', 'heroku',
  ],
  'Tools & Practices': [
    'git', 'github', 'jira', 'agile', 'scrum', 'kanban', 'tdd', 'unit testing',
    'postman', 'figma', 'vs code', 'vim',
  ],
  'Digital Marketing': [
    'seo', 'sem', 'google ads', 'facebook ads', 'social media', 'content marketing',
    'email marketing', 'analytics', 'google analytics', 'copywriting', 'branding',
  ],
  'Design': [
    'photoshop', 'illustrator', 'canva', 'adobe xd', 'ui/ux', 'wireframing', 'prototyping',
    'figma', 'sketch', 'indesign',
  ],
  'Soft Skills': [
    'leadership', 'communication', 'teamwork', 'problem solving', 'critical thinking',
    'time management', 'project management', 'presentation', 'research', 'adaptability',
  ],
};

export interface ExtractedSkills {
  categories: Record<string, string[]>;
  all: string[];
  total: number;
}

export function extractSkills(text: string): ExtractedSkills {
  const lower = text.toLowerCase();
  const categories: Record<string, string[]> = {};
  const found = new Set<string>();

  for (const [category, keywords] of Object.entries(SKILL_KEYWORDS)) {
    const matched = keywords.filter((kw) => {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(lower);
    });

    if (matched.length > 0) {
      categories[category] = matched.map((k) =>
        k.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      );
      matched.forEach((k) => found.add(k));
    }
  }

  return {
    categories,
    all: Array.from(found),
    total: found.size,
  };
}
