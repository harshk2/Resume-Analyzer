import { type ChangeEvent, type DragEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  CloudUpload,
  FileCheck2,
  FileText,
  Info,
  Layers3,
  LockKeyhole,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type Stage = 'empty' | 'analyzing' | 'results' | 'error';
type CareerStage = 'Student / new grad' | 'Early career' | 'Career switcher';
type AnalysisResult = {
  score: number;
  readinessLabel: string;
  sectionCount: number;
  sections: { name: string; detail: string; state: 'found' | 'review' }[];
  risks: { title: string; detail: string; level: 'low' | 'medium' }[];
  evidenceRows: { skill: string; status: string; detail: string; color: 'good' | 'warn' | 'neutral' }[];
  improvements: { number: string; title: string; detail: string }[];
  wordCount: number;
};

const roleOptions = [
  'Software Engineer',
  'AI / LLM Engineer',
  'Machine Learning Engineer',
  'MLOps Engineer',
  'Python Backend Engineer',
];

const sectionNames = ['Contact', 'Summary', 'Experience', 'Projects', 'Education', 'Skills'];

const SAMPLE_RESUME = `Maya Chen
maya.chen@email.com | (415) 555-0198 | linkedin.com/in/mayachen | github.com/mayachen

SUMMARY
Early-career AI engineer building reliable LLM applications and Python services. Interested in retrieval, evaluation, and practical ML systems.

SKILLS
Python, FastAPI, PostgreSQL, PyTorch, LangChain, Docker, Git, pytest

EXPERIENCE
AI Engineering Intern, Northstar Labs | Jun 2024 — Aug 2024
• Built a FastAPI service for retrieval-augmented generation, reducing median response time by 32%.
• Added 120 evaluation cases and improved grounded-answer rate from 68% to 86%.

PROJECTS
Support Copilot | Python, LangChain, PostgreSQL
• Shipped a citation-aware support assistant over 18k internal articles with hybrid retrieval.
• Wrote pytest coverage for retrieval and prompt evaluation; documented failure modes.

EDUCATION
B.S. Computer Science, University of Washington | 2024`;

const ROLE_BENCHMARKS: Record<string, string[]> = {
  'Software Engineer': ['python', 'javascript', 'typescript', 'react', 'api', 'testing', 'git', 'sql', 'docker', 'cloud'],
  'AI / LLM Engineer': ['python', 'llm', 'rag', 'retrieval', 'prompt', 'evaluation', 'vector', 'langchain', 'pytorch', 'api'],
  'Machine Learning Engineer': ['python', 'pytorch', 'tensorflow', 'scikit-learn', 'machine learning', 'model', 'feature', 'evaluation', 'sql', 'deployment'],
  'MLOps Engineer': ['python', 'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'ci/cd', 'mlflow', 'monitoring', 'deployment'],
  'Python Backend Engineer': ['python', 'fastapi', 'django', 'flask', 'api', 'postgresql', 'sql', 'pytest', 'docker', 'redis'],
};

const SKILL_ALIASES: Record<string, string[]> = {
  llm: ['large language model', 'generative ai', 'language model'],
  rag: ['retrieval-augmented', 'retrieval augmented'],
  api: ['rest', 'endpoint', 'service'],
  postgresql: ['postgres'],
  javascript: ['js'],
  typescript: ['ts'],
  machine: ['ml'],
  evaluation: ['evals', 'benchmark'],
  deployment: ['deployed', 'shipping', 'shipped', 'release'],
  testing: ['tests', 'pytest', 'unit test'],
  cloud: ['aws', 'gcp', 'azure'],
};

function cleanText(text: string) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasTerm(text: string, term: string) {
  return new RegExp(`(^|[^a-z0-9+#])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9+#]|$)`, 'i').test(text);
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([\\()nrtbf])/g, (_, character: string) => ({ n: '\n', r: '\n', t: '\t', b: '\b', f: '\f', '\\': '\\', '(': '(', ')': ')' }[character] ?? character))
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

async function extractPdfText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = new TextDecoder('latin1').decode(bytes);
  const pieces: string[] = [];
  const literalPattern = /\(((?:\\.|[^\\)])*)\)\s*T[Jj]/g;
  const arrayPattern = /\[((?:\\.|[^\]])*)\]\s*TJ/g;
  const hexPattern = /<([0-9a-fA-F]+)>\s*T[Jj]/g;
  let match: RegExpExecArray | null;
  while ((match = literalPattern.exec(raw))) pieces.push(decodePdfLiteral(match[1]));
  while ((match = arrayPattern.exec(raw))) {
    const values = match[1].match(/\(((?:\\.|[^\\)])*)\)/g) ?? [];
    pieces.push(values.map((value) => decodePdfLiteral(value.slice(1, -1))).join(''));
  }
  while ((match = hexPattern.exec(raw))) {
    const hex = match[1].length % 2 ? `${match[1]}0` : match[1];
    pieces.push((hex.match(/.{2}/g) ?? []).map((pair) => String.fromCharCode(parseInt(pair, 16))).join(''));
  }
  return cleanText(pieces.join(' '));
}

async function extractDocxText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const read32 = (offset: number) => view.getUint32(offset, true);
  const read16 = (offset: number) => view.getUint16(offset, true);
  let end = bytes.length - 22;
  while (end >= 0 && read32(end) !== 0x06054b50) end -= 1;
  if (end < 0) return '';
  const directoryOffset = read32(end + 16);
  const directorySize = read32(end + 12);
  let cursor = directoryOffset;
  const directoryEnd = directoryOffset + directorySize;
  while (cursor < directoryEnd && read32(cursor) === 0x02014b50) {
    const nameLength = read16(cursor + 28);
    const extraLength = read16(cursor + 30);
    const commentLength = read16(cursor + 32);
    const compression = read16(cursor + 10);
    const compressedSize = read32(cursor + 20);
    const localOffset = read32(cursor + 42);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (name === 'word/document.xml') {
      const localNameLength = read16(localOffset + 26);
      const localExtraLength = read16(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(start, start + compressedSize);
      let xmlBytes = compressed;
      if (compression === 8) {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      const xml = new TextDecoder().decode(xmlBytes);
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      return cleanText(Array.from(document.getElementsByTagName('w:p')).map((paragraph) => paragraph.textContent ?? '').join('\n'));
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return '';
}

async function extractResumeText(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'txt') return cleanText(await file.text());
  if (extension === 'pdf') return extractPdfText(file);
  if (extension === 'docx') return extractDocxText(file);
  if (extension === 'doc') return cleanText(await file.text());
  return '';
}

function buildLocalAnalysis(text: string, role: string, jobDescription: string): AnalysisResult {
  const normalized = cleanText(text).toLowerCase();
  const sectionPatterns: Record<string, RegExp> = {
    Contact: /@|(?:\+?\d[\d\s().-]{7,})|linkedin\.com|github\.com/i,
    Summary: /(^|\n)\s*(summary|profile|objective|about me)\s*($|\n)/i,
    Experience: /(^|\n)\s*(experience|work experience|employment|professional experience)\s*($|\n)/i,
    Projects: /(^|\n)\s*(projects|selected projects|personal projects)\s*($|\n)/i,
    Education: /(^|\n)\s*(education|academic background)\s*($|\n)/i,
    Skills: /(^|\n)\s*(skills|technical skills|technologies|competencies)\s*($|\n)/i,
  };
  const sections = sectionNames.map((name) => {
    const found = sectionPatterns[name].test(text);
    const detail = found
      ? name === 'Contact' ? 'Email, phone, or profile link detected' : 'Heading and text detected'
      : 'Not confidently detected';
    return { name, detail, state: found ? 'found' as const : 'review' as const };
  });
  const sectionCount = sections.filter((section) => section.state === 'found').length;
  const benchmark = ROLE_BENCHMARKS[role] ?? ROLE_BENCHMARKS['Software Engineer'];
  const jobTerms = Object.keys(ROLE_BENCHMARKS).flatMap((key) => ROLE_BENCHMARKS[key]);
  const requestedTerms = jobDescription.trim()
    ? Array.from(new Set(jobTerms.filter((term) => hasTerm(jobDescription.toLowerCase(), term))))
    : benchmark;
  const matched = requestedTerms.filter((term) => hasTerm(normalized, term));
  const aliases = requestedTerms.filter((term) => !matched.includes(term) && (SKILL_ALIASES[term] ?? []).some((alias) => hasTerm(normalized, alias)));
  const missing = requestedTerms.filter((term) => !matched.includes(term) && !aliases.includes(term));
  const evidenceAnchor = /(built|created|developed|shipped|deployed|implemented|designed|led|reduced|improved|automated|wrote|owned)/i;
  const metricsCount = (text.match(/\b\d+(?:\.\d+)?%|\b\d+[kKmM+]?\b/g) ?? []).length;
  const bulletCount = (text.match(/(^|\n)\s*[•●▪*-]\s+/g) ?? []).length;
  const hasEvidence = evidenceAnchor.test(text);
  const structurePoints = (sectionCount / 6) * 30;
  const evidencePoints = Math.min(35, (hasEvidence ? 15 : 5) + Math.min(12, bulletCount * 1.5) + Math.min(8, metricsCount * 2));
  const alignmentPoints = requestedTerms.length ? ((matched.length + aliases.length * 0.75) / requestedTerms.length) * 35 : 18;
  const score = Math.max(15, Math.min(98, Math.round(structurePoints + evidencePoints + alignmentPoints)));
  const evidenceRows = requestedTerms.slice(0, 6).map((term) => {
    const exact = matched.includes(term);
    const alias = aliases.includes(term);
    const listedOnly = exact && sectionPatterns.Skills.test(text) && !new RegExp(`(experience|projects)[\\s\\S]{0,500}${term}`, 'i').test(text);
    return {
      skill: term.replace(/\b\w/g, (character) => character.toUpperCase()),
      status: listedOnly ? 'Listed, needs proof' : exact ? 'Evidence found' : alias ? 'Valid equivalent' : 'Missing from resume',
      detail: listedOnly ? 'Present in the skills vocabulary, but not clearly anchored to a project or experience bullet.' : exact ? 'The term appears in the resume and is available for a reviewer to verify.' : alias ? `A related term appears: ${(SKILL_ALIASES[term] ?? []).find((aliasName) => hasTerm(normalized, aliasName))}.` : `Mentioned in the ${jobDescription.trim() ? 'job description' : 'role benchmark'} but not found in the document.`,
      color: listedOnly || (!exact && !alias) ? 'warn' as const : 'good' as const,
    };
  });
  const risks: AnalysisResult['risks'] = [];
  if (!sectionPatterns.Contact.test(text)) risks.push({ title: 'Contact details are hard to extract', detail: 'Add a plain-text email and phone number near your name so parsers can locate them.', level: 'medium' });
  if (sectionCount < 4) risks.push({ title: 'Some standard headings are unclear', detail: 'Use conventional headings such as Experience, Projects, Education, and Skills.', level: 'medium' });
  if (!/\b(19|20)\d{2}\b/.test(text)) risks.push({ title: 'Dates are not machine-readable', detail: 'Use consistent month/year dates such as Jun 2024 — Aug 2024.', level: 'medium' });
  if (/\b(linkedin|github)\b/i.test(text) && !/https?:\/\/|(?:linkedin|github)\.com/i.test(text)) risks.push({ title: 'Profile links may be displayed without URLs', detail: 'Show the full URL or a recognizable domain next to each profile label.', level: 'low' });
  if (/\t{2,}| {5,}/.test(text)) risks.push({ title: 'Possible column or table text order', detail: 'Extra-wide spacing can cause reading order problems when parsed. Prefer one column.', level: 'medium' });
  if (!risks.length) risks.push({ title: 'No obvious extraction risk detected', detail: 'The text has recognizable headings, dates, and contact signals. Visual layout still deserves a final human check.', level: 'low' });
  const improvements: AnalysisResult['improvements'] = [
    { number: '01', title: metricsCount ? 'Tie every metric to a result' : 'Make one project outcome undeniable', detail: metricsCount ? 'Keep the number, then name what changed and how you measured it.' : 'Replace task lists with the change you made, the scale, and how you knew it worked.' },
    { number: '02', title: 'Name the engineering surface', detail: 'When true, specify the API, model, data pipeline, evaluation, or deployment layer you owned.' },
    { number: '03', title: missing.length ? `Investigate ${missing.slice(0, 2).join(' and ')}` : 'Trim skills without receipts', detail: missing.length ? 'Only add a missing skill if your actual experience supports it; otherwise leave the gap visible.' : 'Keep a skill when a project or experience bullet gives the reader a reason to believe it.' },
  ];
  return {
    score,
    readinessLabel: score >= 80 ? 'Clear signal' : score >= 65 ? 'Good foundation' : 'Promising, needs proof',
    sectionCount,
    sections,
    risks: risks.slice(0, 4),
    evidenceRows,
    improvements,
    wordCount: normalized.split(/\s+/).filter(Boolean).length,
  };
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-mark">
      <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-accent text-accent-foreground shadow-[3px_3px_0_hsl(var(--foreground))]">
        <span className="font-display text-[22px] font-semibold leading-none">r</span>
      </div>
      <div>
        <p className="text-[15px] font-extrabold tracking-[-0.02em] text-sidebar-foreground">readiness</p>
        <p className="font-mono-app text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/55">resume lab</p>
      </div>
    </div>
  );
}

function Sidebar({ onMethodology }: { onMethodology: () => void }) {
  return (
    <aside className="hidden min-h-[100dvh] w-[244px] shrink-0 flex-col bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex" data-testid="navigation-sidebar">
      <BrandMark />
      <div className="mt-12">
        <p className="font-mono-app text-[10px] uppercase tracking-[0.17em] text-sidebar-foreground/40">Workspace</p>
        <nav className="mt-3 space-y-1" aria-label="Workspace navigation">
          <button className="flex w-full items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2.5 text-left text-sm font-semibold text-sidebar-accent-foreground" data-testid="button-nav-review">
            <ScanSearch size={17} strokeWidth={1.8} />
            Resume review
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-sidebar-foreground/55 transition hover:bg-sidebar-accent/70 hover:text-sidebar-foreground" data-testid="button-nav-history" onClick={() => window.alert('History will appear after you save an analysis.')}>
            <BarChart3 size={17} strokeWidth={1.8} />
            Analysis history
          </button>
        </nav>
      </div>
      <div className="mt-auto">
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/45 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-sidebar-accent-foreground">
            <LockKeyhole size={14} />
            Private by default
          </div>
          <p className="mt-2 text-[11px] leading-[1.55] text-sidebar-foreground/50">Your resume stays in this browser during this preview.</p>
        </div>
        <button className="mt-5 flex items-center gap-2 px-1 text-xs font-semibold text-sidebar-foreground/65 transition hover:text-sidebar-foreground" data-testid="button-open-methodology" onClick={onMethodology}>
          <CircleHelp size={15} />
          How the signal works
          <ArrowUpRight size={13} />
        </button>
        <p className="mt-6 font-mono-app text-[10px] text-sidebar-foreground/30">v0.1 local workspace</p>
      </div>
    </aside>
  );
}

function TopBar({ onNew, onMethodology }: { onNew: () => void; onMethodology: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-border/80 px-5 py-4 sm:px-8 lg:px-11" data-testid="header-topbar">
      <div className="flex items-center gap-2 lg:hidden">
        <BrandMark />
      </div>
      <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
        <span className="h-2 w-2 rounded-full bg-[#5d9e83]" />
        Local workspace
        <span className="mx-1 text-border">/</span>
        New analysis
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button className="hidden items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex" data-testid="button-top-methodology" onClick={onMethodology}>
          <Info size={15} />
          Methodology
        </button>
        <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground transition hover:-translate-y-0.5 hover:border-foreground/40" data-testid="button-new-analysis" onClick={onNew}>
          <RotateCcw size={14} />
          New analysis
        </button>
      </div>
    </header>
  );
}

function UploadCard({
  fileName,
  onFile,
  onSample,
}: {
  fileName: string;
  onFile: (file: File) => void;
  onSample: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFile = (file?: File) => {
    if (file) onFile(file);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_10px_30px_hsl(var(--foreground)/.035)] sm:p-7" data-testid="card-upload-resume">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-accent">01 / Resume</p>
          <h2 className="mt-2 text-lg font-extrabold tracking-[-0.03em]">Start with the source</h2>
          <p className="mt-1 max-w-[330px] text-xs leading-5 text-muted-foreground">We look for signals of readiness, not keyword density.</p>
        </div>
        <div className="rounded-full bg-secondary p-2.5 text-secondary-foreground">
          <FileText size={18} strokeWidth={1.8} />
        </div>
      </div>
      <div
        className={`mt-7 flex min-h-[206px] flex-col items-center justify-center rounded-xl border border-dashed px-5 text-center transition ${dragging ? 'border-accent bg-accent/5' : 'border-border bg-background/55 hover:border-foreground/35'}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        data-testid="dropzone-resume"
      >
        <input ref={inputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleChange} data-testid="input-resume-file" />
        {fileName ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <FileCheck2 size={23} />
            </div>
            <p className="mt-4 max-w-full truncate text-sm font-bold" data-testid="text-uploaded-filename">{fileName}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ready for a local signal review</p>
            <button className="mt-4 text-xs font-bold text-accent underline decoration-accent/35 underline-offset-4 hover:decoration-accent" onClick={() => inputRef.current?.click()} data-testid="button-replace-resume">Choose a different file</button>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <CloudUpload size={23} strokeWidth={1.7} />
            </div>
            <p className="mt-4 text-sm font-bold">Drop your resume here</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, or DOC · up to 10 MB</p>
            <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90" onClick={() => inputRef.current?.click()} data-testid="button-choose-resume">Choose file</button>
          </>
        )}
      </div>
      {!fileName && (
        <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs font-bold text-muted-foreground transition hover:border-foreground/35 hover:text-foreground" onClick={onSample} data-testid="button-use-sample-resume">
          <Sparkles size={14} />
          Explore with a sample resume
        </button>
      )}
      <div className="mt-5 flex items-center gap-2 text-[11px] leading-4 text-muted-foreground">
        <ShieldCheck size={14} className="shrink-0 text-[#5d9e83]" />
        No hiring promises. No invented experience. Just readable signals.
      </div>
    </section>
  );
}

function FieldLabel({ children, htmlFor, optional = false }: { children: ReactNode; htmlFor: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center justify-between text-xs font-bold text-foreground">
      {children}
      {optional && <span className="font-normal text-muted-foreground">Optional</span>}
    </label>
  );
}

function ProfileCard({
  role,
  setRole,
  secondaryRole,
  setSecondaryRole,
  careerStage,
  setCareerStage,
  location,
  setLocation,
  jobDescription,
  setJobDescription,
}: {
  role: string;
  setRole: (value: string) => void;
  secondaryRole: string;
  setSecondaryRole: (value: string) => void;
  careerStage: CareerStage;
  setCareerStage: (value: CareerStage) => void;
  location: string;
  setLocation: (value: string) => void;
  jobDescription: string;
  setJobDescription: (value: string) => void;
}) {
  const [showSecondary, setShowSecondary] = useState(Boolean(secondaryRole));
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_10px_30px_hsl(var(--foreground)/.035)] sm:p-7" data-testid="card-target-profile">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-accent">02 / Lens</p>
          <h2 className="mt-2 text-lg font-extrabold tracking-[-0.03em]">Choose your target</h2>
          <p className="mt-1 max-w-[330px] text-xs leading-5 text-muted-foreground">A sharper lens makes the feedback more useful.</p>
        </div>
        <div className="rounded-full bg-secondary p-2.5 text-secondary-foreground">
          <Target size={18} strokeWidth={1.8} />
        </div>
      </div>
      <div className="mt-7 space-y-5">
        <div>
          <FieldLabel htmlFor="primary-role">Primary role</FieldLabel>
          <div className="relative mt-2">
            <select id="primary-role" value={role} onChange={(event) => setRole(event.target.value)} className="w-full appearance-none rounded-lg border border-input bg-background px-3.5 py-3 pr-10 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" data-testid="select-primary-role">
              <option value="">Select a role</option>
              {roleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-3.5 text-muted-foreground" />
          </div>
        </div>
        {!showSecondary ? (
          <button className="flex items-center gap-1.5 text-xs font-bold text-accent transition hover:text-accent/75" onClick={() => setShowSecondary(true)} data-testid="button-add-secondary-role">
            <Plus size={14} />
            Add a secondary role
          </button>
        ) : (
          <div className="animate-rise-in">
            <FieldLabel htmlFor="secondary-role" optional>Secondary role</FieldLabel>
            <div className="relative mt-2">
              <select id="secondary-role" value={secondaryRole} onChange={(event) => setSecondaryRole(event.target.value)} className="w-full appearance-none rounded-lg border border-input bg-background px-3.5 py-3 pr-10 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" data-testid="select-secondary-role">
                <option value="">Select another role</option>
                {roleOptions.filter((option) => option !== role).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-3.5 text-muted-foreground" />
            </div>
          </div>
        )}
        <div>
          <FieldLabel htmlFor="career-stage">Career stage</FieldLabel>
          <div className="relative mt-2">
            <select id="career-stage" value={careerStage} onChange={(event) => setCareerStage(event.target.value as CareerStage)} className="w-full appearance-none rounded-lg border border-input bg-background px-3.5 py-3 pr-10 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" data-testid="select-career-stage">
              <option>Student / new grad</option>
              <option>Early career</option>
              <option>Career switcher</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-3.5 text-muted-foreground" />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="location-preference" optional>Location preference</FieldLabel>
          <div className="relative mt-2">
            <MapPin size={16} className="pointer-events-none absolute left-3.5 top-3.5 text-muted-foreground" />
            <input id="location-preference" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. New York · Remote" className="w-full rounded-lg border border-input bg-background py-3 pl-10 pr-3.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-accent focus:ring-2 focus:ring-accent/15" data-testid="input-location-preference" />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="job-description" optional>Job description</FieldLabel>
          <textarea id="job-description" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste a role description to compare against it..." rows={3} className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3.5 py-3 text-sm leading-5 outline-none transition placeholder:text-muted-foreground/70 focus:border-accent focus:ring-2 focus:ring-accent/15" data-testid="textarea-job-description" />
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">With a description, your result becomes a Job-Specific Match Score.</p>
        </div>
      </div>
    </section>
  );
}

function Intro({ onMethodology }: { onMethodology: () => void }) {
  return (
    <div className="mb-8 max-w-3xl animate-rise-in">
      <div className="flex items-center gap-2 font-mono-app text-[10px] uppercase tracking-[0.17em] text-accent">
        <span className="h-px w-7 bg-accent" />
        A clearer read on your next role
      </div>
      <h1 className="mt-4 max-w-2xl font-display text-[clamp(2.9rem,6vw,5.6rem)] leading-[.91] tracking-[-0.055em] text-foreground">
        Make your readiness <em className="text-accent">legible.</em>
      </h1>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">A grounded resume review for engineers building their first strong signal — from Python backends to LLM systems.</p>
        <button className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-foreground underline decoration-border underline-offset-4 transition hover:text-accent hover:decoration-accent" onClick={onMethodology} data-testid="button-learn-methodology">
          Read our method
          <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  fileName,
  onFile,
  onSample,
  role,
  setRole,
  secondaryRole,
  setSecondaryRole,
  careerStage,
  setCareerStage,
  location,
  setLocation,
  jobDescription,
  setJobDescription,
  onAnalyze,
  formError,
}: {
  fileName: string;
  onFile: (file: File) => void;
  onSample: () => void;
  role: string;
  setRole: (value: string) => void;
  secondaryRole: string;
  setSecondaryRole: (value: string) => void;
  careerStage: CareerStage;
  setCareerStage: (value: CareerStage) => void;
  location: string;
  setLocation: (value: string) => void;
  jobDescription: string;
  setJobDescription: (value: string) => void;
  onAnalyze: () => void;
  formError: string;
}) {
  return (
    <>
      <Intro onMethodology={() => document.dispatchEvent(new CustomEvent('open-methodology'))} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
        <UploadCard fileName={fileName} onFile={onFile} onSample={onSample} />
        <ProfileCard role={role} setRole={setRole} secondaryRole={secondaryRole} setSecondaryRole={setSecondaryRole} careerStage={careerStage} setCareerStage={setCareerStage} location={location} setLocation={setLocation} jobDescription={jobDescription} setJobDescription={setJobDescription} />
      </div>
      <div className="mt-5 flex flex-col items-start justify-between gap-4 border-t border-border pt-5 sm:flex-row sm:items-center">
        <div className="flex max-w-xl items-start gap-2 text-xs leading-5 text-muted-foreground">
          <CircleHelp size={15} className="mt-0.5 shrink-0 text-accent" />
          <span>We score what is visible in the document — not your potential. A lower score is a starting point, never a verdict.</span>
        </div>
        <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
          {formError && <p className="w-full text-right text-xs font-semibold text-destructive" data-testid="text-form-error">{formError}</p>}
          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-extrabold text-accent-foreground shadow-[3px_3px_0_hsl(var(--foreground))] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_hsl(var(--foreground))] active:translate-y-0 sm:w-auto" onClick={onAnalyze} data-testid="button-run-analysis">
            Analyze my resume
            <ArrowUpRight size={17} />
          </button>
        </div>
      </div>
    </>
  );
}

function AnalysisProgress() {
  return (
    <div className="mx-auto max-w-2xl py-16 text-center animate-rise-in" data-testid="state-analyzing">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-[4px_4px_0_hsl(var(--foreground))]">
        <ScanSearch size={28} strokeWidth={1.7} />
      </div>
      <p className="mt-7 font-mono-app text-[10px] uppercase tracking-[0.18em] text-accent">Review in progress</p>
      <h1 className="mt-3 font-display text-4xl tracking-[-0.045em] sm:text-5xl">Reading the signal.</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">We’re checking structure, evidence, and alignment. No claim is added unless the resume can support it.</p>
      <div className="mx-auto mt-10 max-w-sm space-y-3 text-left">
        {['Mapping document sections', 'Checking evidence density', 'Preparing focused next steps'].map((item, index) => (
          <div key={item} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3" data-testid={`status-analysis-step-${index}`}>
            <span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-accent' : 'bg-secondary-foreground/25'}`} />
            <span className="text-xs font-semibold text-muted-foreground">{item}</span>
            <span className="ml-auto h-1 w-12 overflow-hidden rounded-full bg-muted"><span className={`analysis-bar block h-full rounded-full bg-accent ${index !== 0 ? '[animation-delay:300ms]' : ''}`} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry, onReset }: { message: string; onRetry: () => void; onReset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-14 text-center animate-rise-in" data-testid="state-error">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><CircleAlert size={26} /></div>
      <p className="mt-6 font-mono-app text-[10px] uppercase tracking-[0.18em] text-destructive">Couldn’t review that file</p>
      <h1 className="mt-3 font-display text-4xl tracking-[-0.045em]">Let’s take another pass.</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground" data-testid="text-error-message">{message}</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <button className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-bold text-primary-foreground transition hover:-translate-y-0.5" onClick={onRetry} data-testid="button-retry-analysis"><RefreshCw size={15} /> Try again</button>
        <button className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs font-bold transition hover:border-foreground/40" onClick={onReset} data-testid="button-error-new-analysis"><RotateCcw size={15} /> Start over</button>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative h-44 w-44" data-testid="display-score-ring">
      <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
        <circle cx="55" cy="55" r="45" fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
        <circle cx="55" cy="55" r="45" fill="none" stroke="hsl(var(--accent))" strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="animate-draw-in" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[46px] leading-none tracking-[-0.06em]" data-testid="text-score-value">{score}</span>
        <span className="font-mono-app text-[10px] uppercase tracking-[0.12em] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function Results({
  result,
  role,
  secondaryRole,
  jobDescription,
  sample,
  onReset,
}: {
  result: AnalysisResult;
  role: string;
  secondaryRole: string;
  jobDescription: string;
  sample: boolean;
  onReset: () => void;
}) {
  const isMatch = Boolean(jobDescription.trim());
  return (
    <div className="animate-rise-in" data-testid="state-results">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
           <p className="font-mono-app text-[10px] uppercase tracking-[0.17em] text-accent">Analysis complete · local review</p>
          <h1 className="mt-3 font-display text-[clamp(2.6rem,5vw,4.5rem)] leading-[.92] tracking-[-0.055em]">Here’s what reads clearly.</h1>
          <p className="mt-3 text-sm text-muted-foreground">{role}{secondaryRole ? ` + ${secondaryRole}` : ''} · {isMatch ? 'Compared with your job description' : 'Role lens only'}</p>
        </div>
        <button className="flex items-center justify-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-bold transition hover:border-foreground/40 sm:self-auto" onClick={onReset} data-testid="button-results-new-analysis"><RotateCcw size={14} /> New analysis</button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.83fr)_minmax(0,1.17fr)]">
        <section className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8" data-testid="card-score-summary">
          <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full border-[22px] border-accent/20" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-primary-foreground/55">01 / Signal</p>
              <span className="rounded-full bg-[#5d9e83]/20 px-2.5 py-1 text-[10px] font-bold text-[#b8e1cb]">{result.readinessLabel}</span>
            </div>
            <div className="mt-6 flex justify-center"><ScoreRing score={result.score} /></div>
            <h2 className="mt-5 text-center text-base font-extrabold" data-testid="text-score-label">{isMatch ? 'Job-Specific Match Score' : 'Role Readiness Score'}</h2>
            <p className="mx-auto mt-2 max-w-[280px] text-center text-xs leading-5 text-primary-foreground/60">A directional signal about how legibly your current evidence maps to this target.</p>
            <div className="mt-7 border-t border-primary-foreground/15 pt-5">
              <div className="flex items-start gap-2 text-[11px] leading-4 text-primary-foreground/60">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#9fd5b8]" />
                Not a hiring prediction, ATS guarantee, or measure of your potential.
              </div>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8" data-testid="card-section-detection">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-accent">02 / Structure</p>
              <h2 className="mt-2 text-xl font-extrabold tracking-[-0.035em]">Section detection</h2>
            </div>
            <div className="text-right">
              <span className="font-display text-3xl tracking-[-0.06em]" data-testid="text-section-count">{result.sectionCount}</span>
              <p className="font-mono-app text-[9px] uppercase tracking-[0.12em] text-muted-foreground">of 6 sections</p>
            </div>
          </div>
          <div className="mt-7 grid gap-2 sm:grid-cols-2">
            {result.sections.map((section) => (
              <div key={section.name} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3.5 py-3" data-testid={`row-section-${section.name.toLowerCase()}`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full ${section.state === 'found' ? 'bg-[#dceee3] text-[#34775a]' : 'bg-muted text-muted-foreground'}`}>
                  {section.state === 'found' ? <Check size={13} strokeWidth={2.5} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold">{section.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{section.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.17fr)_minmax(0,0.83fr)]">
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8" data-testid="card-evidence-matching">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-accent">03 / Evidence ledger</p>
              <h2 className="mt-2 text-xl font-extrabold tracking-[-0.035em]">Skill matching with receipts</h2>
            </div>
            <Layers3 size={20} className="text-muted-foreground" strokeWidth={1.6} />
          </div>
           <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">Positive signals are based on extracted resume text. “Valid equivalent” means a related alias was found; gaps stay visible instead of being guessed.</p>
          <div className="mt-6 overflow-hidden rounded-xl border border-border">
             {result.evidenceRows.length ? result.evidenceRows.map((row, index) => (
               <div key={row.skill} className={`grid gap-2 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center ${index !== result.evidenceRows.length - 1 ? 'border-b border-border' : ''}`} data-testid={`row-evidence-${index}`}>
                <div>
                  <p className="text-xs font-extrabold">{row.skill}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{row.detail}</p>
                </div>
                <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-bold ${row.color === 'good' ? 'bg-[#dceee3] text-[#34775a]' : row.color === 'warn' ? 'bg-[#f7e9c9] text-[#97651a]' : 'bg-muted text-muted-foreground'}`}>{row.status}</span>
              </div>
             )) : <div className="px-4 py-5 text-xs text-muted-foreground">No benchmark terms were detected for this lens. Review the role language and keep only skills you can support.</div>}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-secondary/45 p-6 sm:p-8" data-testid="card-parser-risks">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-secondary-foreground/70">04 / Parser watch</p>
              <h2 className="mt-2 text-xl font-extrabold tracking-[-0.035em]">Readability risks</h2>
            </div>
            <CircleAlert size={20} className="text-secondary-foreground/70" strokeWidth={1.7} />
          </div>
          <div className="mt-6 space-y-3">
            {result.risks.map((risk, index) => (
              <div key={risk.title} className="rounded-xl border border-secondary-foreground/10 bg-card/60 p-4" data-testid={`row-parser-risk-${index}`}>
                <div className="flex gap-3">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${risk.level === 'medium' ? 'bg-[#c68b2c]' : 'bg-[#5d9e83]'}`} />
                  <div>
                    <p className="text-xs font-extrabold">{risk.title}</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{risk.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-6 sm:p-8" data-testid="card-prioritized-improvements">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-accent">05 / Next edit</p>
            <h2 className="mt-2 text-xl font-extrabold tracking-[-0.035em]">Prioritized improvements</h2>
          </div>
          <p className="max-w-sm text-left text-[11px] leading-4 text-muted-foreground sm:text-right">Suggestions are prompts to investigate, not claims to paste into your resume.</p>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
           {result.improvements.map(({ number, title, detail }) => (
            <div key={number} className="group rounded-xl border border-border bg-background/55 p-4 transition hover:-translate-y-0.5 hover:border-accent/60" data-testid={`card-improvement-${number}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono-app text-[10px] text-accent">{number}</span>
                <ArrowUpRight size={15} className="text-muted-foreground transition group-hover:text-accent" />
              </div>
              <h3 className="mt-7 text-sm font-extrabold leading-5">{title}</h3>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="mt-7 flex items-start gap-2 border-t border-border pt-5 text-[11px] leading-5 text-muted-foreground" data-testid="text-results-disclaimer">
        <Info size={14} className="mt-0.5 shrink-0 text-accent" />
         <p><strong className="text-foreground">A note on this score:</strong> {sample ? 'This sample is illustrative so you can see the shape of the review. Run your own resume for a document-specific signal.' : 'This score is calculated locally from extracted text and role vocabulary. It is directional, not a hiring prediction.'}</p>
      </div>
    </div>
  );
}

function MethodologyPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-foreground/20 p-3 backdrop-blur-[2px] sm:p-6" onClick={onClose} data-testid="overlay-methodology">
      <aside className="max-h-[calc(100dvh-24px)] w-full max-w-md overflow-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-rise-in sm:p-8" onClick={(event) => event.stopPropagation()} data-testid="panel-methodology">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono-app text-[10px] uppercase tracking-[0.16em] text-accent">Method note</p>
            <h2 className="mt-2 font-display text-3xl tracking-[-0.045em]">What this score means.</h2>
          </div>
          <button className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={onClose} data-testid="button-close-methodology"><X size={18} /></button>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">Readiness is about communication clarity: can a reviewer quickly find credible signals for the role you named?</p>
        <div className="mt-7 space-y-4">
          {[
            ['01', 'Structure', 'Can the important sections be found and read without guesswork?'],
            ['02', 'Evidence', 'Are skills attached to projects, outcomes, methods, or ownership?'],
            ['03', 'Alignment', 'When a job description is present, does the visible proof meet its language?'],
          ].map(([number, title, detail]) => (
            <div key={number} className="flex gap-4 border-t border-border pt-4">
              <span className="font-mono-app text-[10px] text-accent">{number}</span>
              <div><p className="text-sm font-extrabold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-7 rounded-xl bg-secondary/60 p-4 text-xs leading-5 text-secondary-foreground">
          <ShieldCheck size={15} className="mb-2" />
          We never guarantee an interview, invent a skill, or treat a score as a verdict on a person.
        </div>
      </aside>
    </div>
  );
}

function Home() {
  const [stage, setStage] = useState<Stage>('empty');
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sample, setSample] = useState(false);
  const [role, setRole] = useState('');
  const [secondaryRole, setSecondaryRole] = useState('');
  const [careerStage, setCareerStage] = useState<CareerStage>('Early career');
  const [location, setLocation] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showMethodology, setShowMethodology] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    const open = () => setShowMethodology(true);
    document.addEventListener('open-methodology', open);
    return () => document.removeEventListener('open-methodology', open);
  }, []);

  const handleFile = (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx', 'txt'].includes(extension ?? '')) {
      setErrorMessage('Please choose a PDF, DOCX, DOC, or TXT resume file.');
      setStage('error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('That file is larger than 10 MB. Choose a smaller resume to continue.');
      setStage('error');
      return;
    }
    setSample(false);
    setSelectedFile(file);
    setFileName(file.name);
    setErrorMessage('');
    setStage('empty');
  };

  const useSample = () => {
    setSample(true);
    setSelectedFile(null);
    setFileName('maya-chen-resume.pdf');
    setRole('AI / LLM Engineer');
    setSecondaryRole('Python Backend Engineer');
    setJobDescription('');
    setStage('empty');
    setFormError('');
  };

  const reset = () => {
    setStage('empty');
    setFileName('');
    setSelectedFile(null);
    setSample(false);
    setRole('');
    setSecondaryRole('');
    setCareerStage('Early career');
    setLocation('');
    setJobDescription('');
    setFormError('');
    setErrorMessage('');
    setResult(null);
  };

  const analyze = async () => {
    if (!fileName) {
      setFormError('Add a resume first.');
      return;
    }
    if (!role) {
      setFormError('Choose a primary role to set the lens.');
      return;
    }
    setFormError('');
    setStage('analyzing');
    try {
      const extractedText = sample ? SAMPLE_RESUME : selectedFile ? await extractResumeText(selectedFile) : '';
      if (extractedText.trim().length < 80) {
        throw new Error('We could not find enough selectable text in that file. Try exporting a text-based PDF or uploading a TXT/DOCX version.');
      }
      window.setTimeout(() => {
        setResult(buildLocalAnalysis(extractedText, role, jobDescription));
        setStage('results');
      }, 1200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The file could not be read. Try a text-based PDF, DOCX, or TXT resume.');
      setStage('error');
    }
  };

  return (
    <div className="noise flex min-h-[100dvh] bg-background">
      <Sidebar onMethodology={() => setShowMethodology(true)} />
      <div className="min-w-0 flex-1">
        <TopBar onNew={reset} onMethodology={() => setShowMethodology(true)} />
        <main className="mx-auto max-w-[1320px] px-5 pb-16 pt-9 sm:px-8 sm:pt-12 lg:px-11 lg:pt-14">
          {stage === 'empty' && <EmptyState fileName={fileName} onFile={handleFile} onSample={useSample} role={role} setRole={setRole} secondaryRole={secondaryRole} setSecondaryRole={setSecondaryRole} careerStage={careerStage} setCareerStage={setCareerStage} location={location} setLocation={setLocation} jobDescription={jobDescription} setJobDescription={setJobDescription} onAnalyze={analyze} formError={formError} />}
          {stage === 'analyzing' && <AnalysisProgress />}
          {stage === 'error' && <ErrorState message={errorMessage} onRetry={() => setStage('empty')} onReset={reset} />}
          {stage === 'results' && result && <Results result={result} role={role} secondaryRole={secondaryRole} jobDescription={jobDescription} sample={sample} onReset={reset} />}
        </main>
        <footer className="mx-auto flex max-w-[1320px] flex-col gap-2 border-t border-border px-5 py-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-11">
          <span className="font-mono-app uppercase tracking-[0.12em]">Readiness / resume lab</span>
          <span>Local prototype · built for honest iteration</span>
        </footer>
      </div>
      {showMethodology && <MethodologyPanel onClose={() => setShowMethodology(false)} />}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;