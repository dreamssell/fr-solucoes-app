import { useState } from "react";
import { useEditorStore } from "@/lib/editor-store";
import { Button } from "@/components/ui/button";
import {
  Settings2,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Edit2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";

export function DashboardEditor() {
  const { isEditing, setIsEditing, dashboardTexts, resetTexts } = useEditorStore();
  const [persistedTexts, setPersistedTexts] = useLocalStorage<Record<string, string>>(
    "fr-dashboard-texts",
    {},
  );
  const [expanded, setExpanded] = useState(false);

  const handleSave = () => {
    setPersistedTexts({ ...persistedTexts, ...dashboardTexts });
    setIsEditing(false);
  };

  const handleReset = () => {
    if (confirm("Tem certeza que deseja resetar todos os textos para o padrão original?")) {
      setPersistedTexts({});
      resetTexts();
      window.location.reload();
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 transition-all duration-300",
        expanded ? "translate-y-0" : "translate-y-2",
      )}
    >
      {expanded && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/90 p-3 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-4">
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              "justify-start gap-2 font-bold",
              isEditing && "bg-gold text-gold-foreground",
            )}
          >
            {isEditing ? <Eye className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
            {isEditing ? "Modo Visualização" : "Modo Edição"}
          </Button>

          {isEditing && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                className="justify-start gap-2 border-success/30 text-success hover:bg-success/10 font-bold"
              >
                <Save className="h-4 w-4" /> Salvar Alterações
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="justify-start gap-2 border-danger/30 text-danger hover:bg-danger/10 font-bold"
              >
                <RotateCcw className="h-4 w-4" /> Resetar Padrão
              </Button>
            </>
          )}
        </div>
      )}

      <Button
        size="icon"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "h-12 w-12 rounded-full shadow-2xl transition-all duration-300",
          expanded
            ? "bg-card border-gold/50 text-gold rotate-0"
            : "bg-gold text-gold-foreground hover:scale-110",
        )}
      >
        {expanded ? <ChevronDown className="h-6 w-6" /> : <Settings2 className="h-6 w-6" />}
      </Button>
    </div>
  );
}
