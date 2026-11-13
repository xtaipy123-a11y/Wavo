import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthLock } from "./AuthLock";

const auth = vi.hoisted(() => ({
  status: "anonymous",
  initialize: vi.fn(async () => {}),
}));

vi.mock("../store/authStore", () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}));
vi.mock("@/features/navigation/ui/AppFrame", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/social/ListeningSync", () => ({
  default: () => <div data-listening-sync />,
}));

function CurrentPage() {
  return <p>{useLocation().pathname === "/login" ? "Login" : "Home"}</p>;
}

describe("AuthLock", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_DEV_SKIP_LOGIN", undefined);
    auth.status = "anonymous";
    auth.initialize.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function render(path = "/") {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <AuthLock><CurrentPage /></AuthLock>
        </MemoryRouter>,
      );
    });
  }

  it("opens the dev app without a session and enables local listening sync", async () => {
    await render();
    expect(container.textContent).toBe("Home");
    expect(container.querySelector("main")).not.toBeNull();
    expect(container.querySelector("[data-listening-sync]")).not.toBeNull();
    expect(auth.initialize).toHaveBeenCalledOnce();
  });

  it("does not wait for authentication initialization in dev mode", async () => {
    auth.status = "initializing";
    await render();
    expect(container.textContent).toBe("Home");
  });

  it("leaves an old login route when starting the dev app", async () => {
    await render("/login");
    expect(container.textContent).toBe("Home");
  });

  it("always requires authentication in production even if skip-login is set", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEV_SKIP_LOGIN", "true");
    await render();
    expect(container.textContent).toBe("Login");
    expect(container.querySelector("main")).toBeNull();
  });

  it("allows developers to opt back into the normal sign-in flow", async () => {
    vi.stubEnv("VITE_DEV_SKIP_LOGIN", "false");
    await render();
    expect(container.textContent).toBe("Login");
  });

  it("keeps the normal session and background sync behavior for signed-in users", async () => {
    vi.stubEnv("DEV", false);
    auth.status = "authenticated";
    await render("/login");
    expect(container.textContent).toBe("Home");
    expect(container.querySelector("[data-listening-sync]")).not.toBeNull();
  });
});
