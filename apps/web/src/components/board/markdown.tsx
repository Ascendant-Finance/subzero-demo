'use client';

import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

/** Sanitized markdown for descriptions and comments (spec section 3). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-sm max-w-none text-sm leading-relaxed [&_a]:text-[var(--color-accent)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--color-surface-2)] [&_code]:px-1 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--color-surface-2)] [&_pre]:p-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
