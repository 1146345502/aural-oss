"use client";

import { QuestionCard, type QuestionCardData } from "@/components/interview/question-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { QUESTION_TYPE_STYLES } from "@/components/interview/question-card";
import {
  Check,
  Copy,
  ListOrdered,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

interface Question {
  id: string;
  text: string;
  type: string;
  description?: string | null;
  isRequired: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any;
  starterCode?: { language: string; code: string } | null;
  order: number;
}

interface AssessmentCriterion {
  name: string;
  description: string;
}

export function QuestionBuilder({
  interviewId,
  questions,
  assessmentCriteria,
}: {
  interviewId: string;
  questions: Question[];
  assessmentCriteria?: AssessmentCriterion[] | null;
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Assessment criteria state
  const [editableCriteria, setEditableCriteria] = useState<AssessmentCriterion[]>(
    (assessmentCriteria as AssessmentCriterion[]) ?? [],
  );
  const [editingCriterionIndex, setEditingCriterionIndex] = useState<number | null>(null);
  const criterionSnapshotRef = useRef<AssessmentCriterion | null>(null);
  const [criteriaChanged, setCriteriaChanged] = useState(false);
  const [savingCriteria, setSavingCriteria] = useState(false);

  // Drag-and-drop state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [optimisticOrder, setOptimisticOrder] = useState<Question[] | null>(null);

  const createMutation = trpc.question.create.useMutation({
    onSuccess: () => {
      utils.interview.getById.invalidate({ id: interviewId });
      setAddingNew(false);
      toast({ title: "Question added" });
    },
  });

  const updateMutation = trpc.question.update.useMutation({
    onSuccess: () => {
      utils.interview.getById.invalidate({ id: interviewId });
      setEditingId(null);
      toast({ title: "Question updated" });
    },
  });

  const deleteMutation = trpc.question.delete.useMutation({
    onSuccess: () => {
      utils.interview.getById.invalidate({ id: interviewId });
      setEditingId(null);
      toast({ title: "Question deleted" });
    },
  });

  const reorderMutation = trpc.question.reorder.useMutation({
    onSuccess: () => {
      utils.interview.getById.invalidate({ id: interviewId }).then(() => {
        setOptimisticOrder(null);
      });
    },
    onError: () => {
      setOptimisticOrder(null);
      toast({ title: "Failed to reorder", variant: "destructive" });
    },
  });

  const updateInterviewMutation = trpc.interview.update.useMutation({
    onSuccess: () => {
      utils.interview.getById.invalidate({ id: interviewId });
      setCriteriaChanged(false);
      setSavingCriteria(false);
      toast({ title: "Assessment criteria saved" });
    },
    onError: () => {
      setSavingCriteria(false);
    },
  });

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex === null || fromIndex === dropIndex) {
        dragIndexRef.current = null;
        setDragOverIndex(null);
        return;
      }

      // Optimistically reorder locally
      const reordered = [...questions];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      setOptimisticOrder(reordered);

      const ids = reordered.map((q) => q.id);
      reorderMutation.mutate({ interviewId, questionIds: ids });
      dragIndexRef.current = null;
      setDragOverIndex(null);
    },
    [questions, interviewId, reorderMutation],
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleSaveCriteria = () => {
    setSavingCriteria(true);
    updateInterviewMutation.mutate({
      id: interviewId,
      assessmentCriteria: editableCriteria,
    });
  };

  const newQuestionDefaults: QuestionCardData = {
    text: "",
    type: "OPEN_ENDED",
    description: "",
    isRequired: true,
  };

  const displayQuestions = optimisticOrder ?? questions;
  const reordering = reorderMutation.isLoading;

  return (
    <div className="space-y-6">
      {/* Questions section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="h-4 w-4" />
            Questions ({questions.length})
            {reordering && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {displayQuestions.length === 0 && !addingNew && (
            <div className="py-8 text-center">
              <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-3 text-sm font-semibold">No questions yet</h3>
              <p className="text-xs text-muted-foreground">
                Add your first question to get started.
              </p>
            </div>
          )}

          {displayQuestions.length > 0 && (
            <div className={cn("space-y-2", reordering && "pointer-events-none opacity-70 transition-opacity")}>
              {displayQuestions.map((q, index) => (
                <QuestionCard
                  key={q.id}
                  data={q}
                  index={index}
                  editing={editingId === q.id}
                  saving={editingId === q.id && updateMutation.isLoading}
                  deleting={editingId === q.id && deleteMutation.isLoading}
                  onStartEdit={() => setEditingId(q.id)}
                  onSave={(updated) => {
                    updateMutation.mutate({
                      id: q.id,
                      text: updated.text,
                      type: updated.type as "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH",
                      description: updated.description as string | undefined,
                      isRequired: updated.isRequired,
                      options: updated.options,
                      starterCode: updated.starterCode as { language: string; code: string } | null | undefined,
                    });
                  }}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => deleteMutation.mutate({ id: q.id })}
                  dragProps={{
                    draggable: editingId !== q.id && !reordering,
                    onDragStart: (e) => handleDragStart(e, index),
                    onDragOver: (e) => handleDragOver(e, index),
                    onDragLeave: handleDragLeave,
                    onDrop: (e) => handleDrop(e, index),
                    onDragEnd: handleDragEnd,
                  }}
                  className={cn(
                    dragOverIndex === index && dragIndexRef.current !== index
                      ? "border-primary ring-1 ring-primary"
                      : "",
                    dragIndexRef.current === index ? "opacity-50" : "",
                  )}
                />
              ))}
            </div>
          )}

          {/* Inline add new question */}
          {addingNew && (
            <QuestionCard
              data={newQuestionDefaults}
              index={questions.length}
              editing
              hideDelete
              saving={createMutation.isLoading}
              onStartEdit={() => {}}
              onSave={(data) => {
                createMutation.mutate({
                  interviewId,
                  text: data.text,
                  type: data.type as "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH",
                  description: data.description as string | undefined,
                  isRequired: data.isRequired,
                  options: data.options,
                  starterCode: data.starterCode as { language: string; code: string } | null | undefined,
                });
              }}
              onCancel={() => setAddingNew(false)}
              onDelete={() => setAddingNew(false)}
            />
          )}

          {!addingNew && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-dashed"
                onClick={() => setAddingNew(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add New
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-dashed"
                onClick={() => setImportOpen(true)}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                Import Existing
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Questions Dialog */}
      <ImportQuestionsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        interviewId={interviewId}
        existingQuestionTexts={questions.map((q) => q.text)}
        onImported={() => {
          utils.interview.getById.invalidate({ id: interviewId });
          toast({ title: "Questions imported" });
        }}
      />

      {/* Assessment Criteria section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              Assessment Criteria
            </CardTitle>
            {criteriaChanged && (
              <Button
                size="sm"
                onClick={handleSaveCriteria}
                disabled={savingCriteria}
              >
                {savingCriteria ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3 w-3" />
                )}
                Save Criteria
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editableCriteria.length === 0 && editingCriterionIndex === null && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No assessment criteria defined. Add criteria to evaluate participants.
            </p>
          )}
          {editableCriteria.map((c, i) => (
            <div
              key={i}
              className={`group flex items-start gap-2 rounded-md border px-3 py-2 transition-all ${editingCriterionIndex !== i ? "hover:border-primary/30" : ""}`}
            >
              {editingCriterionIndex === i ? (
                <div className="flex-1 space-y-2">
                  <Input
                    value={c.name}
                    onChange={(e) => {
                      setEditableCriteria((prev) =>
                        prev.map((cr, idx) =>
                          idx === i ? { ...cr, name: e.target.value } : cr,
                        ),
                      );
                      setCriteriaChanged(true);
                    }}
                    placeholder="Criterion name..."
                    className="h-8 text-sm font-medium"
                    autoFocus
                  />
                  <Textarea
                    value={c.description}
                    onChange={(e) => {
                      setEditableCriteria((prev) =>
                        prev.map((cr, idx) =>
                          idx === i ? { ...cr, description: e.target.value } : cr,
                        ),
                      );
                      setCriteriaChanged(true);
                    }}
                    placeholder="What this criterion measures..."
                    rows={2}
                    className="resize-y text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete criterion?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove this assessment criterion. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                              setEditableCriteria((prev) =>
                                prev.filter((_, idx) => idx !== i),
                              );
                              setEditingCriterionIndex(null);
                              criterionSnapshotRef.current = null;
                              setCriteriaChanged(true);
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-foreground/50 hover:bg-foreground/5"
                      onClick={() => {
                        const snapshot = criterionSnapshotRef.current;
                        criterionSnapshotRef.current = null;
                        if (snapshot) {
                          setEditableCriteria((prev) =>
                            prev.map((cr, idx) =>
                              idx === i ? snapshot : cr,
                            ),
                          );
                        } else {
                          setEditableCriteria((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          );
                        }
                        setEditingCriterionIndex(null);
                      }}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        criterionSnapshotRef.current = null;
                        setEditingCriterionIndex(null);
                      }}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => {
                      criterionSnapshotRef.current = structuredClone(editableCriteria[i]);
                      setEditingCriterionIndex(i);
                    }}
                  >
                    <p className="text-sm font-medium">
                      {c.name || (
                        <span className="italic text-muted-foreground">
                          Untitled criterion
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.description || "No description"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="p-0.5 text-muted-foreground/80 hover:text-foreground transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        criterionSnapshotRef.current = structuredClone(editableCriteria[i]);
                        setEditingCriterionIndex(i);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="p-0.5 text-muted-foreground/80 hover:text-destructive transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete criterion?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove this assessment criterion. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                              setEditableCriteria((prev) =>
                                prev.filter((_, idx) => idx !== i),
                              );
                              setEditingCriterionIndex(null);
                              criterionSnapshotRef.current = null;
                              setCriteriaChanged(true);
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed"
            onClick={() => {
              setEditableCriteria((prev) => [
                ...prev,
                { name: "", description: "" },
              ]);
              setEditingCriterionIndex(editableCriteria.length);
              setCriteriaChanged(true);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Criterion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Import Questions Dialog                                            */
/* ------------------------------------------------------------------ */

function ImportQuestionsDialog({
  open,
  onOpenChange,
  interviewId,
  existingQuestionTexts,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interviewId: string;
  existingQuestionTexts: string[];
  onImported: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const allQuestions = trpc.question.listAll.useQuery(
    { limit: 200 },
    { enabled: open },
  );

  const createMutation = trpc.question.create.useMutation();

  // Filter out questions already in this interview and apply search
  const filteredQuestions = useMemo(() => {
    const existing = new Set(existingQuestionTexts.map((t) => t.toLowerCase()));
    let result = (allQuestions.data?.questions ?? []).filter(
      (q) =>
        q.interview.id !== interviewId &&
        !existing.has(q.text.toLowerCase()),
    );
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (q) =>
          q.text.toLowerCase().includes(s) ||
          (q.description ?? "").toLowerCase().includes(s) ||
          q.interview.title.toLowerCase().includes(s),
      );
    }
    return result;
  }, [allQuestions.data, interviewId, existingQuestionTexts, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    setImporting(true);
    const selected = filteredQuestions.filter((q) => selectedIds.has(q.id));
    const baseOrder = existingQuestionTexts.length;
    await Promise.all(
      selected.map((q, i) =>
        createMutation.mutateAsync({
          interviewId,
          order: baseOrder + i,
          text: q.text,
          description: q.description,
          type: q.type as "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH",
          options: q.options ?? undefined,
          starterCode: q.starterCode as { language: string; code: string } | null | undefined,
        })
      )
    );
    setImporting(false);
    setSelectedIds(new Set());
    setSearch("");
    onOpenChange(false);
    onImported();
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSelectedIds(new Set());
      setSearch("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Existing Questions</DialogTitle>
          <DialogDescription>
            Select questions from your other interviews to add to this one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-lg border code-scrollbar">
            {allQuestions.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredQuestions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search.trim()
                  ? "No questions match your search."
                  : "No questions available to import."}
              </p>
            ) : (
              <div className="divide-y">
                {filteredQuestions.map((q) => {
                  const style =
                    QUESTION_TYPE_STYLES[q.type] ??
                    QUESTION_TYPE_STYLES.OPEN_ENDED;
                  const TypeIcon = style.icon;
                  return (
                    <label
                      key={q.id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedIds.has(q.id)}
                        onCheckedChange={() => toggleSelect(q.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {q.text}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", style.badgeClass)}
                          >
                            <TypeIcon className="mr-0.5 h-2.5 w-2.5" />
                            {style.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {q.interview.title}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0 || importing}
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Import ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
