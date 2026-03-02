/** Well-known port metadata for display hints. */

interface PortInfo {
  label: string;
  category: "web" | "database" | "dev" | "system" | "cache" | "mail" | "other";
}

const WELL_KNOWN_PORTS: Record<number, PortInfo> = {
  22: { label: "SSH", category: "system" },
  25: { label: "SMTP", category: "mail" },
  53: { label: "DNS", category: "system" },
  80: { label: "HTTP", category: "web" },
  443: { label: "HTTPS", category: "web" },
  587: { label: "SMTP", category: "mail" },
  993: { label: "IMAP", category: "mail" },
  995: { label: "POP3", category: "mail" },
  1080: { label: "SOCKS", category: "system" },
  1433: { label: "MSSQL", category: "database" },
  1521: { label: "Oracle", category: "database" },
  2181: { label: "ZooKeeper", category: "system" },
  3000: { label: "Dev server", category: "dev" },
  3001: { label: "Dev server", category: "dev" },
  3306: { label: "MySQL", category: "database" },
  4200: { label: "Angular", category: "dev" },
  4321: { label: "Astro", category: "dev" },
  5000: { label: "Flask", category: "dev" },
  5173: { label: "Vite", category: "dev" },
  5432: { label: "PostgreSQL", category: "database" },
  5500: { label: "Live Server", category: "dev" },
  5672: { label: "RabbitMQ", category: "system" },
  6379: { label: "Redis", category: "cache" },
  8000: { label: "Dev server", category: "dev" },
  8080: { label: "HTTP alt", category: "web" },
  8443: { label: "HTTPS alt", category: "web" },
  8888: { label: "Jupyter", category: "dev" },
  9090: { label: "Prometheus", category: "system" },
  9200: { label: "Elasticsearch", category: "database" },
  11211: { label: "Memcached", category: "cache" },
  27017: { label: "MongoDB", category: "database" },
  1420: { label: "Vite (Tauri)", category: "dev" },
  1421: { label: "Vite HMR", category: "dev" },
};

const CATEGORY_COLORS: Record<string, string> = {
  web: "var(--syntax-string)",
  database: "var(--syntax-number)",
  dev: "var(--success)",
  system: "var(--text-tertiary)",
  cache: "var(--warning)",
  mail: "var(--accent)",
  other: "var(--text-tertiary)",
};

export function getPortInfo(port: number): PortInfo | null {
  return WELL_KNOWN_PORTS[port] ?? null;
}

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
}
