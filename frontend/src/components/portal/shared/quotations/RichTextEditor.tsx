/**
 * @fileoverview Rich Text Editor Component for Terms & Conditions Line Items.
 * Provides modern rich text formatting (Bold, Italic, Underline, Strikethrough, Lists, Colors, Highlight)
 * with real-time HTML synchronization and dark mode support.
 * @module components/portal/shared/quotations/RichTextEditor
 */
"use client";

import React, { useRef, useEffect } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Highlighter,
  RotateCcw,
  Palette,
} from "lucide-react";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Enter condition text...",
  className = "",
  minHeight = "60px",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingFromPropRef = useRef(false);

  // Sync value from prop to contentEditable when prop changes externally
  useEffect(() => {
    if (editorRef.current) {
      const currentHtml = editorRef.current.innerHTML;
      if (currentHtml !== value && !isUpdatingFromPropRef.current) {
        editorRef.current.innerHTML = value || "";
      }
      isUpdatingFromPropRef.current = false;
    }
  }, [value]);

  const execCmd = (command: string, cmdValue: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, cmdValue);
    emitChange();
  };

  const emitChange = () => {
    if (!editorRef.current) return;
    isUpdatingFromPropRef.current = true;
    const html = editorRef.current.innerHTML;
    // Treat empty tags like <br> or <div><br></div> as empty string
    const cleanHtml = html === "<br>" || html === "<div><br></div>" ? "" : html;
    onChange(cleanHtml);
  };

  const handleApplyColor = (color: string) => {
    execCmd("foreColor", color);
  };

  const handleApplyHighlight = (color: string) => {
    execCmd("hiliteColor", color);
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 overflow-hidden shadow-2xs ${className}`}
    >
      {/* Rich Text Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/80 p-1.5 dark:border-white/10 dark:bg-slate-800/60 shrink-0">
        {/* Bold */}
        <button
          type="button"
          onClick={() => execCmd("bold")}
          title="Bold (Ctrl+B)"
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>

        {/* Italic */}
        <button
          type="button"
          onClick={() => execCmd("italic")}
          title="Italic (Ctrl+I)"
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>

        {/* Underline */}
        <button
          type="button"
          onClick={() => execCmd("underline")}
          title="Underline (Ctrl+U)"
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
        >
          <Underline className="h-3.5 w-3.5" />
        </button>

        {/* Strikethrough */}
        <button
          type="button"
          onClick={() => execCmd("strikeThrough")}
          title="Strikethrough"
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

        {/* Bullet List */}
        <button
          type="button"
          onClick={() => execCmd("insertUnorderedList")}
          title="Bullet List"
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
        >
          <List className="h-3.5 w-3.5" />
        </button>

        {/* Numbered List */}
        <button
          type="button"
          onClick={() => execCmd("insertOrderedList")}
          title="Numbered List"
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

        {/* Color Palette Quick Buttons */}
        <div className="flex items-center gap-1 px-1">
          <Palette className="h-3.5 w-3.5 text-slate-400 mr-0.5" />
          <button
            type="button"
            onClick={() => handleApplyColor("#2563eb")} // Blue
            className="h-3.5 w-3.5 rounded-full bg-blue-600 hover:scale-110 transition cursor-pointer"
            title="Text Color: Blue"
          />
          <button
            type="button"
            onClick={() => handleApplyColor("#dc2626")} // Red
            className="h-3.5 w-3.5 rounded-full bg-red-600 hover:scale-110 transition cursor-pointer"
            title="Text Color: Red"
          />
          <button
            type="button"
            onClick={() => handleApplyColor("#16a34a")} // Green
            className="h-3.5 w-3.5 rounded-full bg-emerald-600 hover:scale-110 transition cursor-pointer"
            title="Text Color: Green"
          />
          <button
            type="button"
            onClick={() => handleApplyColor("#0f172a")} // Default slate
            className="h-3.5 w-3.5 rounded-full bg-slate-900 dark:bg-white hover:scale-110 transition cursor-pointer"
            title="Text Color: Default"
          />
        </div>

        {/* Highlight Yellow */}
        <button
          type="button"
          onClick={() => handleApplyHighlight("#fef08a")} // Yellow
          title="Highlight Yellow"
          className="rounded-md p-1.5 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950/60 cursor-pointer"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

        {/* Clear Format */}
        <button
          type="button"
          onClick={() => execCmd("removeFormat")}
          title="Clear Formatting"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Editable Area */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          style={{ minHeight }}
          className="w-full p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none overflow-y-auto leading-relaxed prose dark:prose-invert max-w-none [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4"
        />

        {/* Placeholder overlay when empty */}
        {(!value || value === "<br>" || value === "<div><br></div>") && (
          <div className="pointer-events-none absolute left-2.5 top-2.5 text-xs text-slate-400 select-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
