/**
 * @fileoverview Component to safely render rich text HTML content for Terms & Conditions.
 * @module components/portal/shared/quotations/RichTextDisplay
 */
"use client";

import React from "react";

type RichTextDisplayProps = {
  content: string;
  className?: string;
};

export function RichTextDisplay({ content, className = "" }: RichTextDisplayProps) {
  if (!content) return null;

  // Check if content contains HTML tags
  const isHtml = /<[a-z][\s\S]*>/i.test(content);

  if (isHtml) {
    return (
      <div
        className={`prose dark:prose-invert max-w-none text-xs leading-relaxed text-slate-800 dark:text-slate-200 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>p]:mb-1 ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return (
    <span className={`text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap ${className}`}>
      {content}
    </span>
  );
}
