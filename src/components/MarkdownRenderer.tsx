import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const [copiedCodeIndex, setCopiedCodeIndex] = React.useState<number | null>(null);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard?.writeText(text);
    setCopiedCodeIndex(idx);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  let codeBlockCounter = 0;

  return (
    <div className="markdown-content text-xs leading-relaxed text-slate-200">
      <ReactMarkdown
        components={{
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 shadow-sm">
              <table className="w-full text-left border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-900/90 border-b border-slate-800">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
              {children}
            </th>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-slate-800/30 transition-colors">{children}</tr>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-200 whitespace-nowrap">{children}</td>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-cyan-200">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
          h1: ({ children }) => (
            <h1 className="mt-3.5 mb-2 text-sm sm:text-base font-extrabold text-white border-b border-slate-800 pb-1 flex items-center gap-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-1.5 text-xs sm:text-sm font-bold text-cyan-300 flex items-center gap-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2.5 mb-1 text-xs font-semibold text-indigo-300">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="my-2 pl-4 list-disc space-y-1 text-slate-300 marker:text-cyan-500">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 pl-4 list-decimal space-y-1 text-slate-300 marker:text-cyan-500 font-mono text-[11px]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 pl-3 border-l-2 border-cyan-500/80 bg-cyan-950/20 py-1.5 pr-2 rounded-r-lg text-cyan-100 italic text-[11px]">
              {children}
            </blockquote>
          ),
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed text-slate-200">{children}</p>
          ),
          code: ({ inline, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-slate-800/90 text-cyan-300 font-mono text-[11px] border border-slate-700/50"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            const blockIndex = codeBlockCounter++;
            const codeString = String(children).replace(/\n$/, '');
            return (
              <div className="my-2.5 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner font-mono text-[11px]">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/80 text-[10px] text-slate-400">
                  <span className="font-semibold text-cyan-400">CODE / RULE BLOCK</span>
                  <button
                    onClick={() => handleCopy(codeString, blockIndex)}
                    className="flex items-center gap-1 hover:text-cyan-300 text-slate-400 transition-colors"
                    title="Copy code"
                  >
                    {copiedCodeIndex === blockIndex ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 text-[9px]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span className="text-[9px]">Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 overflow-x-auto text-slate-200 scrollbar-thin scrollbar-thumb-slate-800">
                  <code>{children}</code>
                </pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
