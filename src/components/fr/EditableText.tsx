import React, { useState, useEffect } from "react";
import { useEditorStore } from "@/lib/editor-store";
import { cn } from "@/lib/utils";
import { Check, X, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface EditableTextProps {
  id: string;
  defaultText: string;
  className?: string;
  as?: React.ElementType;
}

export function EditableText({
  id,
  defaultText,
  className,
  as: Component = "span",
}: EditableTextProps) {
  const { isEditing, dashboardTexts, setDashboardText } = useEditorStore();
  const [localValue, setLocalValue] = useState(dashboardTexts[id] || defaultText);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (dashboardTexts[id]) {
      setLocalValue(dashboardTexts[id]);
    }
  }, [id, dashboardTexts]);

  if (!isEditing) {
    return <Component className={className}>{dashboardTexts[id] || defaultText}</Component>;
  }

  return (
    <div className={cn("relative group w-full", isFocused ? "z-10" : "")}>
      <Input
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          setDashboardText(id, e.target.value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={cn(
          "h-auto min-h-0 bg-gold/5 border-gold/20 focus:border-gold/50 py-1 px-2 font-inherit text-inherit",
          className,
        )}
      />
      <div className="absolute -top-6 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gold text-gold-foreground text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
        Editando ID: {id}
      </div>
    </div>
  );
}
