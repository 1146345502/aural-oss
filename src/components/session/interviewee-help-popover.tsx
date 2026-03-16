"use client";

import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { useState } from "react";
import {
    getChatGuideItems,
    getVoiceGuideItems,
    GuideStepCard,
} from "./interviewee-guide-content";

export function IntervieweeHelpPopover({
  mode,
}: {
  mode: "voice" | "chat";
}) {
  const items = mode === "voice" ? getVoiceGuideItems() : getChatGuideItems();
  const [index, setIndex] = useState(0);

  const canPrev = index > 0;
  const canNext = index < items.length - 1;

  return (
    <Popover onOpenChange={() => setIndex(0)}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="How It Works"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-[340px] p-0"
      >
        {/* Header with inline navigation */}
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold">Interface Guide</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {index + 1} of {items.length}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!canPrev}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!canNext}
              onClick={() => setIndex((i) => i + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Card content */}
        <div className="px-4 pb-3">
          <GuideStepCard item={items[index]} index={index} />
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {items.map((_, i) => (
            <button
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index
                  ? "w-4 bg-primary"
                  : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/40",
              )}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
