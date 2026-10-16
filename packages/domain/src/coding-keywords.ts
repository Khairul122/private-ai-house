export const CODING_KEYWORD_GROUPS = [
  { id: 'web', label: 'Web, frontend, dan backend', keywords: ['web development', 'website', 'web app', 'frontend', 'front end', 'backend', 'back end', 'full stack', 'fullstack', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue', 'Nuxt', 'Angular', 'Svelte', 'HTML', 'CSS', 'Tailwind', 'Bootstrap', 'Node.js', 'Express', 'NestJS', 'PHP', 'Laravel', 'Symfony', 'CodeIgniter', 'Python', 'Django', 'Flask', 'FastAPI', 'Ruby', 'Rails', 'Java', 'Spring Boot', 'C#', '.NET', 'ASP.NET', 'Go', 'Golang', 'Rust', 'Elixir', 'Phoenix', 'GraphQL', 'REST API', 'API integration', 'webhook', 'WebSocket'] },
  { id: 'mobile', label: 'Mobile dan desktop', keywords: ['mobile app', 'Android', 'iOS', 'Flutter', 'Dart', 'React Native', 'Kotlin', 'Swift', 'SwiftUI', 'Jetpack Compose', 'Ionic', 'Capacitor', 'Expo', 'Electron', 'Tauri', 'desktop application', 'Windows application', 'C++', 'Qt', 'Unity', 'Unreal Engine', 'game development'] },
  { id: 'data', label: 'Database, data, dan AI', keywords: ['SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'SQLite', 'Supabase', 'Firebase', 'database', 'database migration', 'data engineering', 'data pipeline', 'ETL', 'pandas', 'NumPy', 'data analysis', 'machine learning', 'deep learning', 'TensorFlow', 'PyTorch', 'scikit-learn', 'OpenAI', 'LLM', 'RAG', 'chatbot', 'AI integration', 'computer vision', 'NLP', 'vector database'] },
  { id: 'cloud', label: 'Cloud, server, dan DevOps', keywords: ['DevOps', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud', 'Linux', 'Nginx', 'Apache', 'CI/CD', 'GitHub Actions', 'GitLab CI', 'Terraform', 'Ansible', 'server deployment', 'VPS', 'Vercel', 'Netlify', 'Cloudflare', 'microservices', 'serverless', 'monitoring', 'observability', 'infrastructure'] },
  { id: 'commerce', label: 'Bisnis digital dan CMS', keywords: ['ecommerce', 'e-commerce', 'online store', 'WordPress', 'WooCommerce', 'Shopify', 'Magento', 'PrestaShop', 'Drupal', 'Strapi', 'Sanity', 'headless CMS', 'SaaS', 'ERP', 'CRM', 'dashboard', 'admin panel', 'payment integration', 'Stripe', 'PayPal', 'Midtrans', 'Xendit', 'booking system', 'inventory system'] },
  { id: 'automation', label: 'Otomasi, scraping, dan pengujian', keywords: ['automation', 'web scraping', 'data extraction', 'scraper', 'crawler', 'Selenium', 'Playwright', 'Puppeteer', 'BeautifulSoup', 'Scrapy', 'scripting', 'Bash', 'PowerShell', 'Telegram bot', 'Discord bot', 'n8n', 'Zapier', 'Make.com', 'unit test', 'integration test', 'automated testing', 'QA automation', 'Cypress', 'Jest', 'Vitest', 'bug fix', 'debugging', 'code review', 'refactoring', 'performance optimization', 'software development', 'programming', 'coding', 'technical documentation'] },
] as const;

export function normalizeKeywords(values: readonly string[]): string[] {
  return [...new Map(values.map((value) => value.normalize('NFKC').trim()).filter(Boolean).map((value) => [value.toLowerCase(), value])).values()];
}

export const CODING_KEYWORDS = normalizeKeywords(CODING_KEYWORD_GROUPS.flatMap((group) => [...group.keywords]));

export function matchesProjectKeyword(text: string, keyword: string): boolean {
  const normalized = keyword.normalize('NFKC').trim();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(text.normalize('NFKC'));
}

export function selectSearchTerms(specializations: string[], keywords: string[], cycle: number, limit = 8): string[] {
  const terms = normalizeKeywords([...specializations, ...keywords]);
  if (terms.length <= limit) return terms;
  const start = (cycle * limit) % terms.length;
  return Array.from({ length: limit }, (_, index) => terms[(start + index) % terms.length]!);
}
