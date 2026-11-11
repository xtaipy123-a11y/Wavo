import { memo, useRef, Suspense } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

interface PageTransitionProps {
  children: React.ReactNode;
}

function TransitionContent({ children }: PageTransitionProps) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // The friends page stores in-page state (open chat, draft, attached playlist)
  // in component state and only uses query params to describe a share target.
  // Re-keying it on query changes would unmount the page and close the chat.
  const keepsStateAcrossSearch = pathname === "/friends";
  const currentKey = keepsStateAcrossSearch ? pathname : `${pathname}?${searchParams.toString()}`;
  const shellKeyRef = useRef(currentKey);
  if (pathname !== "/player") {
    shellKeyRef.current = currentKey;
  }
  const key = pathname === "/player" ? shellKeyRef.current : currentKey;
  return (
    <div
      key={key}
      className={`h-full w-full ${pathname === "/player" ? "" : "page-transition"}`}
    >
      {children}
    </div>
  );
}

function PageTransition({ children }: PageTransitionProps) {
  return (
    <Suspense fallback={<div className="h-full w-full">{children}</div>}>
      <TransitionContent>{children}</TransitionContent>
    </Suspense>
  );
}

export default memo(PageTransition);
