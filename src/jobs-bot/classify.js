import { norm } from '../lib/text.js';

export const CATEGORIES = ['frontend', 'backend', 'fullstack'];

export const CATEGORY_META = {
  frontend: { label: 'Frontend', emoji: '\u{1F3A8}', color: 0x38bdf8 },
  backend: { label: 'Backend', emoji: '\u2699\uFE0F', color: 0x34d399 },
  fullstack: { label: 'Full Stack', emoji: '\u{1F9E9}', color: 0xa78bfa },
};

// term -> weight. Title matches count double, so role-shaped words sit here too.
const FRONTEND_TERMS = [
  ['frontend', 5],
  ['front-end', 5],
  ['front end', 5],
  ['react', 3],
  ['react.js', 3],
  ['reactjs', 3],
  ['next.js', 3],
  ['nextjs', 3],
  ['vue', 3],
  ['vue.js', 3],
  ['nuxt', 3],
  ['angular', 3],
  ['svelte', 2],
  ['remix', 2],
  ['astro', 2],
  ['javascript', 1],
  ['typescript', 1],
  ['html', 1],
  ['css', 2],
  ['scss', 2],
  ['sass', 1],
  ['tailwind', 2],
  ['redux', 2],
  ['zustand', 1],
  ['material ui', 1],
  ['chakra', 1],
  ['storybook', 1],
  ['vite', 1],
  ['webpack', 1],
  ['figma', 1],
  ['responsive', 1],
  ['accessibility', 1],
  ['ui developer', 4],
  ['ui engineer', 4],
  ['web developer', 2],
  ['react native', 2],
];

const BACKEND_TERMS = [
  ['backend', 5],
  ['back-end', 5],
  ['back end', 5],
  ['node', 2],
  ['node.js', 3],
  ['nodejs', 3],
  ['express', 2],
  ['nestjs', 3],
  ['java', 2],
  ['spring', 2],
  ['spring boot', 3],
  ['python', 2],
  ['django', 2],
  ['flask', 2],
  ['fastapi', 2],
  ['golang', 3],
  ['rust', 2],
  ['c#', 2],
  ['asp.net', 2],
  ['.net', 2],
  ['php', 2],
  ['laravel', 2],
  ['ruby', 2],
  ['rails', 2],
  ['sql', 1],
  ['postgres', 2],
  ['postgresql', 2],
  ['mysql', 2],
  ['mongodb', 2],
  ['redis', 2],
  ['kafka', 2],
  ['rabbitmq', 2],
  ['elasticsearch', 1],
  ['microservices', 2],
  ['rest api', 2],
  ['restful', 2],
  ['graphql', 2],
  ['grpc', 2],
  ['aws', 1],
  ['docker', 1],
  ['kubernetes', 1],
  ['devops', 1],
  ['distributed systems', 2],
  ['scalability', 1],
  ['api engineer', 4],
];

const FULLSTACK_TERMS = [
  ['fullstack', 8],
  ['full-stack', 8],
  ['full stack', 8],
  ['mern', 6],
  ['mean stack', 6],
  ['mevn', 6],
  ['frontend and backend', 4],
  ['front-end and back-end', 4],
  ['end-to-end web', 2],
];

const TECH_TAGS = [
  ['react', 'React'],
  ['next.js', 'Next.js'],
  ['nextjs', 'Next.js'],
  ['vue', 'Vue'],
  ['angular', 'Angular'],
  ['svelte', 'Svelte'],
  ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'],
  ['node.js', 'Node.js'],
  ['nodejs', 'Node.js'],
  ['nestjs', 'NestJS'],
  ['express', 'Express'],
  ['java', 'Java'],
  ['spring boot', 'Spring Boot'],
  ['python', 'Python'],
  ['django', 'Django'],
  ['fastapi', 'FastAPI'],
  ['flask', 'Flask'],
  ['golang', 'Go'],
  ['rust', 'Rust'],
  ['c#', 'C#'],
  ['.net', '.NET'],
  ['php', 'PHP'],
  ['laravel', 'Laravel'],
  ['ruby', 'Ruby'],
  ['rails', 'Rails'],
  ['postgres', 'PostgreSQL'],
  ['mysql', 'MySQL'],
  ['mongodb', 'MongoDB'],
  ['redis', 'Redis'],
  ['kafka', 'Kafka'],
  ['graphql', 'GraphQL'],
  ['grpc', 'gRPC'],
  ['aws', 'AWS'],
  ['gcp', 'GCP'],
  ['azure', 'Azure'],
  ['docker', 'Docker'],
  ['kubernetes', 'Kubernetes'],
  ['terraform', 'Terraform'],
  ['tailwind', 'Tailwind'],
  ['redux', 'Redux'],
  ['react native', 'React Native'],
  ['flutter', 'Flutter'],
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Counts whole-word occurrences, capped at 2 per term so a keyword-stuffed
 * description cannot dominate the score.
 */
function countTerm(text, term) {
  const pattern = new RegExp(`(?<![\\w.+#-])${escapeRegExp(term)}(?![\\w+#])`, 'g');
  const matches = text.match(pattern);
  return matches ? Math.min(matches.length, 2) : 0;
}

function scoreTerms(title, body, terms) {
  let score = 0;
  for (const [term, weight] of terms) {
    const inTitle = countTerm(title, term);
    const inBody = countTerm(body, term);
    score += inTitle * weight * 2 + inBody * weight;
  }
  return score;
}

function collectTags(text) {
  const seen = new Map();
  for (const [term, label] of TECH_TAGS) {
    if (seen.has(label)) continue;
    if (countTerm(text, term) > 0) seen.set(label, true);
  }
  return [...seen.keys()];
}

/**
 * Decides which channel a listing belongs to, based on title + description.
 *
 * Rules, in order:
 *   1. explicit "full stack" wording  -> fullstack
 *   2. meaningful signal on both sides -> fullstack
 *   3. otherwise whichever side wins clearly
 *   4. no signal                      -> defaultCategory (with low confidence)
 */
export function classifyJob({ title = '', description = '', tags = [] }, { defaultCategory = 'fullstack', minConfidence = 2 } = {}) {
  const cleanTitle = norm(title);
  const cleanBody = norm([description, Array.isArray(tags) ? tags.join(' ') : tags].filter(Boolean).join(' '));

  const frontendScore = scoreTerms(cleanTitle, cleanBody, FRONTEND_TERMS);
  const backendScore = scoreTerms(cleanTitle, cleanBody, BACKEND_TERMS);
  const fullstackScore = scoreTerms(cleanTitle, cleanBody, FULLSTACK_TERMS);

  const combined = `${cleanTitle} ${cleanBody}`;
  const detectedTags = collectTags(combined).slice(0, 6);

  let category;
  let confidence;

  if (fullstackScore >= 8) {
    category = 'fullstack';
    confidence = fullstackScore;
  } else if (frontendScore >= 3 && backendScore >= 3) {
    category = 'fullstack';
    confidence = Math.min(frontendScore, backendScore) + Math.min(fullstackScore, 8) / 2;
  } else if (frontendScore >= minConfidence && frontendScore >= backendScore * 1.3) {
    category = 'frontend';
    confidence = frontendScore;
  } else if (backendScore >= minConfidence && backendScore >= frontendScore * 1.3) {
    category = 'backend';
    confidence = backendScore;
  } else if (frontendScore > backendScore) {
    category = 'frontend';
    confidence = frontendScore;
  } else if (backendScore > frontendScore) {
    category = 'backend';
    confidence = backendScore;
  } else {
    category = CATEGORIES.includes(defaultCategory) ? defaultCategory : 'fullstack';
    confidence = 0;
  }

  return {
    category,
    confidence: Math.round(confidence * 10) / 10,
    scores: { frontend: frontendScore, backend: backendScore, fullstack: fullstackScore },
    tags: detectedTags,
  };
}
