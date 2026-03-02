import { useEffect, useCallback } from "react";
import { useJsonToolStore } from "./store";
import { openJsonFile, saveJsonFile, formatJson } from "./commands";
import Toolbar from "./components/Toolbar";
import Editor from "./components/Editor";
import TreeView from "./components/TreeView";

export default function JsonTool() {
  const {
    content,
    filePath,
    viewMode,
    setContent,
    setFilePath,
    setValidationError,
    markClean,
  } = useJsonToolStore();

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "o") {
        e.preventDefault();
        try {
          const result = await openJsonFile();
          if (result) {
            setContent(result.content);
            setFilePath(result.path);
            markClean();
            setValidationError(null);
          }
        } catch (err) {
          console.error("Failed to open file:", err);
        }
      }

      if (mod && e.key === "s") {
        e.preventDefault();
        try {
          const path = await saveJsonFile(content, filePath);
          if (path) {
            setFilePath(path);
            markClean();
          }
        } catch (err) {
          console.error("Failed to save file:", err);
        }
      }

      if (mod && e.shiftKey && e.key === "f") {
        e.preventDefault();
        try {
          const formatted = formatJson(content);
          setContent(formatted);
          setValidationError(null);
        } catch (err) {
          setValidationError({
            message: (err as Error).message,
            line: 0,
            column: 0,
          });
        }
      }
    },
    [content, filePath, setContent, setFilePath, setValidationError, markClean],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Drag and drop
  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) {
        const text = await file.text();
        setContent(text);
        setFilePath(null);
        markClean();
        try {
          JSON.parse(text);
          setValidationError(null);
        } catch (err) {
          setValidationError({
            message: (err as Error).message,
            line: 0,
            column: 0,
          });
        }
      }
    },
    [setContent, setFilePath, setValidationError, markClean],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragover", handleDragOver);
    return () => {
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragover", handleDragOver);
    };
  }, [handleDrop, handleDragOver]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        {(viewMode === "editor" || viewMode === "split") && (
          <div
            className={`overflow-hidden ${viewMode === "split" ? "w-1/2 border-r border-border-default" : "w-full"}`}
          >
            <Editor />
          </div>
        )}
        {(viewMode === "tree" || viewMode === "split") && (
          <div
            className={`overflow-hidden ${viewMode === "split" ? "w-1/2" : "w-full"}`}
          >
            <TreeView showLineNumbers={viewMode === "split"} />
          </div>
        )}
      </div>
    </div>
  );
}
