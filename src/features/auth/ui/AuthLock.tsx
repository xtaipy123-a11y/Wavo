import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import AppFrame from "@/features/navigation/ui/AppFrame";
import ListeningSync from "@/features/social/ListeningSync";
import { takePendingReleaseToken } from "@/app/pendingReleaseLink";

export function AuthLock({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const status = useAuthStore((state) => state.status);
  const initialize = useAuthStore((state) => state.initialize);
  const skipLogin = import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_LOGIN !== "false";
  const canEnterApp = status === "authenticated" || skipLogin;

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (status === "anonymous" && !skipLogin && pathname !== "/login") {
      navigate("/login", { replace: true });
    }
    if (canEnterApp && pathname === "/login") {
      const token = takePendingReleaseToken();
      navigate(token ? `/uploads?claim=${encodeURIComponent(token)}` : "/", { replace: true });
    }
  }, [pathname, navigate, status, skipLogin, canEnterApp]);

  if (
    (status === "initializing" && !skipLogin) ||
    (status === "anonymous" && !skipLogin && pathname !== "/login") ||
    (canEnterApp && pathname === "/login")
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-primary">
        <span className="h-[22px] w-[22px] animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
      </div>
    );
  }

  return pathname === "/login" ? children : <>{status === "authenticated" && <ListeningSync />}<AppFrame>{children}</AppFrame></>;
}

export default AuthLock;
