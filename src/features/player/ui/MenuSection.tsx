import { AnimatePresence, motion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { LuChevronDown } from "react-icons/lu";

interface MenuSectionProps {
  icon?: ReactNode;
  label: string;
  summary?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Collapsible row used to keep the player options popup compact.
 * The header always shows the current value so the panel stays readable
 * without expanding every section.
 */
export function MenuSection({
  icon,
  label,
  summary,
  expanded,
  onToggle,
  children,
}: MenuSectionProps) {
  const contentId = useId();

  return (
    <div className="border-b border-white/[0.08] last:border-b-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? contentId : undefined}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-1.5 py-[5px] text-left text-text-primary transition-colors hover:bg-white/[0.06]"
      >
        <span className="flex min-w-0 items-center gap-[6px] text-[12px] font-medium">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-[6px] text-[11px] font-normal text-text-secondary">
          {summary}
          <LuChevronDown
            size={13}
            aria-hidden="true"
            className={`shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-1.5 pb-2 pt-[2px]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
